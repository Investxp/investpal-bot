"""
SXBetClient: real execution client for SX Bet (sx.bet), a decentralised
peer-to-peer sports betting exchange on SX Network (Polygon-adjacent L2).

Same interface as betfair_client.py's BetfairClientBase, so RecoveryEngine /
StakeCalculator / db.py / api_server.py / dashboard.html all work completely
unchanged -- only the execution layer differs.

Key differences from Betfair, baked into this client:
  - No username/password session.  Orders are authorised by signing an
    EIP-712 typed-data message with your wallet's private key -- the key
    never leaves your machine and is never sent to SX's servers.
  - Read endpoints (markets, odds, orderbook) need no API key at all.
    An API key is only required to subscribe to realtime WebSocket channels.
  - 0% commission on straight bets -- set commission_rate=0.0 in LineConfig.
  - Odds are expressed as "implied probability" in a fixed-point integer
    format on-chain (implied * 10^20).  This client converts both ways so
    the rest of the engine always sees ordinary decimal odds.
  - SX is P2P: this client implements TAKER fills only, which gives
    immediate, deterministic execution against existing maker orders.

IMPORTANT: test against the Toronto testnet (testnet=True, the default)
before pointing this at mainnet with real funds. Endpoint paths and payload
field names are verified against docs.sx.bet as of 2026-06 but should be
rechecked at integration time.

EIP-712 signing verified against official SX Bet documentation:
  https://docs.sx.bet/developers/filling-orders
  https://docs.sx.bet/developers/testnet-and-mainnet

Contract addresses (live, fetched from GET /metadata):
  Testnet EIP712FillHasher  : 0xC8dbedb008deB9c870E871F7a470f847C67135E9
  Testnet TokenTransferProxy: 0xD7cCD18d33d3EC2879A6DF8e82Ef81C8830c534F
  Testnet USDC              : 0x1BC6326EA6aF2aB8E4b6Bc83418044B1923b2956
  Mainnet EIP712FillHasher  : 0x845a2Da2D70fEDe8474b1C8518200798c60aC364
  Mainnet TokenTransferProxy: 0x38aef22152BC8965bf0af7Cf53586e4b0C4E9936
  Mainnet USDC              : 0x6629Ce1Cf35Cc1329ebB4F63202F3f197b3F050B
  domainVersion             : 6.0 (both networks)
"""
import secrets
import time
from decimal import Decimal, getcontext
from typing import Optional

import requests

from betfair_client import BetfairClientBase
from models import BetOutcome, Side
from stake_calculator import OddsQuote

try:
    from eth_account import Account
except ImportError:  # pragma: no cover
    Account = None

getcontext().prec = 30

# ---------------------------------------------------------------------------
# Network constants
# ---------------------------------------------------------------------------
MAINNET_API = "https://api.sx.bet"
TESTNET_API = "https://api.toronto.sx.bet"

# SX expresses implied odds as a fixed-point integer with 20 decimal places
# (percentageOdds = implied_probability * 10**20).
ODDS_FIXED_POINT = Decimal(10) ** 20

# EIP-712 typed-data schema for fill requests (stable across v6.0 protocol).
# Verified against docs.sx.bet/developers/filling-orders.
FILL_TYPES = {
    "Details": [
        {"name": "action",          "type": "string"},
        {"name": "market",          "type": "string"},
        {"name": "betting",         "type": "string"},
        {"name": "stake",           "type": "string"},
        {"name": "worstOdds",       "type": "string"},
        {"name": "worstReturning",  "type": "string"},
        {"name": "fills",           "type": "FillObject"},
    ],
    "FillObject": [
        {"name": "stakeWei",                "type": "string"},
        {"name": "marketHash",              "type": "string"},
        {"name": "baseToken",               "type": "string"},
        {"name": "desiredOdds",             "type": "string"},
        {"name": "oddsSlippage",            "type": "uint256"},
        {"name": "isTakerBettingOutcomeOne","type": "bool"},
        {"name": "fillSalt",                "type": "uint256"},
        {"name": "beneficiary",             "type": "address"},
        {"name": "beneficiaryType",         "type": "uint8"},
        {"name": "cashOutTarget",           "type": "bytes32"},
    ],
}


# ---------------------------------------------------------------------------
# Odds conversion helpers
# ---------------------------------------------------------------------------

def implied_to_decimal(implied_fraction: Decimal) -> float:
    """0.5 implied -> 2.0 decimal odds."""
    if implied_fraction <= 0:
        return float("inf")
    return float(Decimal(1) / implied_fraction)


def decimal_to_implied(decimal_odds: float) -> Decimal:
    """2.0 decimal odds -> 0.5 implied."""
    return Decimal(1) / Decimal(str(decimal_odds))


def maker_pct_to_taker_desired_odds(maker_pct_odds_str: str) -> str:
    """
    Convert a maker's percentageOdds string to the taker's desiredOdds string.

    Per SX docs: taker_implied = 10^20 - maker_percentageOdds
    This is the value that must be passed as `desiredOdds` in the fill payload.
    """
    maker_pct = int(maker_pct_odds_str)
    taker_pct = int(ODDS_FIXED_POINT) - maker_pct
    return str(taker_pct)


def taker_desired_odds_to_decimal(desired_odds_str: str) -> float:
    """Convert a taker's desiredOdds string back to decimal odds (for display)."""
    taker_implied = Decimal(desired_odds_str) / ODDS_FIXED_POINT
    return implied_to_decimal(taker_implied)


def from_api_percentage_odds(raw: str) -> float:
    """
    Convert a maker's raw percentageOdds string (e.g. '50000000000000000000')
    directly to the maker's decimal odds (e.g. 2.0).
    Kept as a public utility for backward-compatibility and external tooling.
    NOTE: for fill payloads you need taker desiredOdds, not this value --
    use maker_pct_to_taker_desired_odds() for that.
    """
    implied = Decimal(raw) / ODDS_FIXED_POINT
    return implied_to_decimal(implied)


# ---------------------------------------------------------------------------
# Main client
# ---------------------------------------------------------------------------

class SXBetClient(BetfairClientBase):
    """
    event_id passed into get_quotes / place_back_bet / settle is expected to
    be an SX `marketHash` (0x-prefixed hex string from /markets/active).

    Side.A maps to SX outcome one, Side.B maps to outcome two.  Your
    LineConfig + event-queue builder is responsible for keeping that mapping
    consistent per market (home team = outcome one for moneyline markets is
    the standard SX convention, but verify per sport/market_type).

    Usage:
        client = SXBetClient(private_key="0x...", testnet=True)
        # One-time setup per wallet (or until approval is revoked):
        client.enable_betting()
    """

    def __init__(
        self,
        private_key: str,
        api_key: Optional[str] = None,
        testnet: bool = True,
        base_token: Optional[str] = None,
        odds_slippage: int = 0,
    ):
        if Account is None:
            raise RuntimeError("eth-account is not installed (pip install eth-account)")
        self.account = Account.from_key(private_key)
        self.address = self.account.address
        self.api_key = api_key
        self.testnet = testnet
        self.base_url = TESTNET_API if testnet else MAINNET_API
        self.odds_slippage = odds_slippage  # 0 = exact odds only (fine for pre-game)

        # Correct USDC addresses per network (verified from GET /metadata 2026-06)
        if testnet:
            self.chain_id = 79479957
            self._default_token = "0x1BC6326EA6aF2aB8E4b6Bc83418044B1923b2956"  # testnet USDC
        else:
            self.chain_id = 4162
            self._default_token = "0x6629Ce1Cf35Cc1329ebB4F63202F3f197b3F050B"  # mainnet USDC

        self.base_token = base_token or self._default_token

        # USDC has 6 decimals; WSX/other tokens use 18
        usdc_addrs = {
            "0x1bc6326ea6af2ab8e4b6bc83418044b1923b2956",  # testnet
            "0x6629ce1cf35cc1329ebb4f63202f3f197b3f050b",  # mainnet
        }
        self.token_decimals = 6 if self.base_token.lower() in usdc_addrs else 18

        self.session = requests.Session()
        if api_key:
            self.session.headers["x-api-key"] = api_key

        # Fetch live metadata: EIP712FillHasher (verifyingContract) and
        # domainVersion.  These differ between testnet and mainnet and can
        # change between protocol upgrades -- always fetch at startup.
        self.verifying_contract: str
        self.domain_version: str
        self.token_transfer_proxy: str
        self._fetch_metadata()

    def _fetch_metadata(self):
        """Pull EIP712FillHasher, domainVersion, TokenTransferProxy from /metadata."""
        try:
            resp = self.session.get(f"{self.base_url}/metadata", timeout=10)
            resp.raise_for_status()
            data = resp.json().get("data", {})
            self.verifying_contract = data["EIP712FillHasher"]
            self.domain_version = data.get("domainVersion", "6.0")
            self.token_transfer_proxy = data["TokenTransferProxy"]
        except Exception as exc:
            # If /metadata is unreachable during testing, fall back to known-good
            # values (correct as of 2026-06) but warn loudly.
            print(f"[SXBetClient] WARNING: could not fetch /metadata ({exc}). "
                  f"Falling back to hardcoded addresses -- verify these are current.")
            if self.testnet:
                self.verifying_contract = "0xC8dbedb008deB9c870E871F7a470f847C67135E9"
                self.token_transfer_proxy = "0xD7cCD18d33d3EC2879A6DF8e82Ef81C8830c534F"
            else:
                self.verifying_contract = "0x845a2Da2D70fEDe8474b1C8518200798c60aC364"
                self.token_transfer_proxy = "0x38aef22152BC8965bf0af7Cf53586e4b0C4E9936"
            self.domain_version = "6.0"

    # ------------------------------------------------------------------
    # One-time account setup
    # ------------------------------------------------------------------

    def enable_betting(self):
        """
        Approve the TokenTransferProxy contract to move USDC on your behalf.
        This is required once per wallet before any fill will be accepted.

        The simplest approach is to place a manual bet on toronto.sx.bet (testnet)
        or sx.bet (mainnet), which triggers the approval automatically.
        This method does it programmatically via POST /orders/approve.

        Returns True if the API reports success; raises on failure.
        """
        payload = {
            "token": self.base_token,
            "wallet": self.address,
        }
        resp = self.session.post(f"{self.base_url}/orders/approve", json=payload, timeout=30)
        resp.raise_for_status()
        result = resp.json()
        ok = result.get("status") == "success"
        if not ok:
            raise RuntimeError(f"enable_betting failed: {result}")
        return True

    # ------------------------------------------------------------------
    # Read side (no signing required)
    # ------------------------------------------------------------------

    def get_quotes(self, event_id: str, fallback: bool = False) -> dict:
        """
        event_id = marketHash.  Uses GET /orders/odds/best to fetch the best
        available taker price per outcome efficiently, then returns an OddsQuote
        for each side.

        NOTE on Side mapping: Side.A = outcome one, Side.B = outcome two.
        Your event-queue builder must record which outcome maps to which team
        when it populates the line's queue (standard: home team = outcome one
        for moneyline markets, but verify per sport/market_type).
        """
        resp = self.session.get(
            f"{self.base_url}/orders/odds/best",
            params={"marketHashes": event_id, "baseToken": self.base_token},
            timeout=10,
        )
        resp.raise_for_status()

        # The API returns a list under data.bestOdds; each item has a
        # marketHash plus outcomeOne and outcomeTwo sub-objects.
        best_odds_list = resp.json().get("data", {}).get("bestOdds", [])
        if not best_odds_list:
            quote_a = OddsQuote(Side.A, 0.0, 0.0)
            quote_b = OddsQuote(Side.B, 0.0, 0.0)
        else:
            entry = best_odds_list[0]
            quote_a = self._parse_outcome_quote(entry.get("outcomeOne", {}), Side.A)
            quote_b = self._parse_outcome_quote(entry.get("outcomeTwo", {}), Side.B)

        # Fallback to GET /orders if size/volume is 0 or missing in bestOdds (common on testnet)
        if fallback and (quote_a.matched_volume == 0.0 or quote_b.matched_volume == 0.0):
            try:
                orders_resp = self.session.get(
                    f"{self.base_url}/orders",
                    params={"marketHashes": event_id},
                    timeout=10,
                )
                orders_resp.raise_for_status()
                orders = orders_resp.json().get("data", [])
                
                # Filter active orders for the correct token
                active_orders = [
                    o for o in orders 
                    if o.get("orderStatus") == "ACTIVE" 
                    and o.get("baseToken", "").lower() == self.base_token.lower()
                ]
                
                # Side A: Taker bets Outcome One, maker bets Outcome Two (isMakerBettingOutcomeOne == False)
                if quote_a.matched_volume == 0.0:
                    maker_two_orders = [o for o in active_orders if not o.get("isMakerBettingOutcomeOne")]
                    if maker_two_orders:
                        best_pct_two = max(int(o["percentageOdds"]) for o in maker_two_orders)
                        best_orders_two = [o for o in maker_two_orders if int(o["percentageOdds"]) == best_pct_two]
                        vol_two = 0
                        for o in best_orders_two:
                            tot = int(o.get("totalBetSize", 0))
                            fil = int(o.get("fillAmount", 0))
                            pen = int(o.get("pendingFillAmount", 0))
                            vol_two += max(0, tot - fil - pen)
                        
                        taker_pct_str = maker_pct_to_taker_desired_odds(str(best_pct_two))
                        taker_decimal = taker_desired_odds_to_decimal(taker_pct_str)
                        matched_volume = float(Decimal(vol_two) / Decimal(10) ** self.token_decimals)
                        quote_a = OddsQuote(Side.A, round(taker_decimal, 4), round(matched_volume, 2))
                
                # Side B: Taker bets Outcome Two, maker bets Outcome One (isMakerBettingOutcomeOne == True)
                if quote_b.matched_volume == 0.0:
                    maker_one_orders = [o for o in active_orders if o.get("isMakerBettingOutcomeOne")]
                    if maker_one_orders:
                        best_pct_one = max(int(o["percentageOdds"]) for o in maker_one_orders)
                        best_orders_one = [o for o in maker_one_orders if int(o["percentageOdds"]) == best_pct_one]
                        vol_one = 0
                        for o in best_orders_one:
                            tot = int(o.get("totalBetSize", 0))
                            fil = int(o.get("fillAmount", 0))
                            pen = int(o.get("pendingFillAmount", 0))
                            vol_one += max(0, tot - fil - pen)
                        
                        taker_pct_str = maker_pct_to_taker_desired_odds(str(best_pct_one))
                        taker_decimal = taker_desired_odds_to_decimal(taker_pct_str)
                        matched_volume = float(Decimal(vol_one) / Decimal(10) ** self.token_decimals)
                        quote_b = OddsQuote(Side.B, round(taker_decimal, 4), round(matched_volume, 2))
            except Exception as e:
                print(f"[SXBetClient] Error fetching/parsing raw orders fallback: {e}")

        return {Side.A: quote_a, Side.B: quote_b}

    def get_quotes_bulk(self, market_hashes: list) -> dict:
        """
        Fetch best odds for multiple market hashes in parallel batches using 
        the bulk GET /orders/odds/best endpoint.
        Returns a dictionary mapping market_hash -> {Side.A: OddsQuote, Side.B: OddsQuote}.
        """
        if not market_hashes:
            return {}

        batch_size = 40
        all_quotes = {}

        for i in range(0, len(market_hashes), batch_size):
            batch = market_hashes[i:i+batch_size]
            hashes_str = ",".join(batch)
            try:
                resp = self.session.get(
                    f"{self.base_url}/orders/odds/best",
                    params={"marketHashes": hashes_str, "baseToken": self.base_token},
                    timeout=10,
                )
                resp.raise_for_status()
                best_odds_list = resp.json().get("data", {}).get("bestOdds", [])

                entry_map = {
                    entry["marketHash"].lower(): entry 
                    for entry in best_odds_list 
                    if "marketHash" in entry
                }

                for mh in batch:
                    entry = entry_map.get(mh.lower())
                    if not entry:
                        quote_a = OddsQuote(Side.A, 0.0, 0.0)
                        quote_b = OddsQuote(Side.B, 0.0, 0.0)
                    else:
                        quote_a = self._parse_outcome_quote(entry.get("outcomeOne", {}), Side.A)
                        quote_b = self._parse_outcome_quote(entry.get("outcomeTwo", {}), Side.B)
                    all_quotes[mh] = {Side.A: quote_a, Side.B: quote_b}
            except Exception as e:
                print(f"[SXBetClient] Error fetching bulk quotes: {e}")
                # Fallback to empty quotes for this batch
                for mh in batch:
                    all_quotes[mh] = {Side.A: OddsQuote(Side.A, 0.0, 0.0), Side.B: OddsQuote(Side.B, 0.0, 0.0)}

        return all_quotes

    def _parse_outcome_quote(self, outcome: dict, side: Side) -> OddsQuote:
        """
        Parse one outcome sub-object from GET /orders/odds/best into an OddsQuote.

        The taker's decimal odds = 1 / taker_implied
        where taker_implied = (10^20 - maker_percentageOdds) / 10^20
        """
        maker_pct_str = outcome.get("percentageOdds")
        if not maker_pct_str or maker_pct_str == "0":
            return OddsQuote(side, 0.0, 0.0)

        taker_desired = maker_pct_to_taker_desired_odds(maker_pct_str)
        taker_decimal = taker_desired_odds_to_decimal(taker_desired)

        # Available size comes from the remaining unfilled amount at best price
        size_raw = outcome.get("size", outcome.get("availableSize", "0"))
        matched_volume = float(Decimal(str(size_raw)) / Decimal(10) ** self.token_decimals)

        return OddsQuote(side, round(taker_decimal, 4), round(matched_volume, 2))

    # ------------------------------------------------------------------
    # Write side (EIP-712 signed)
    # ------------------------------------------------------------------

    def place_back_bet(self, event_id: str, side: Side, stake: float, odds: float) -> str:
        """
        Places a TAKER fill against the best available maker order on the
        requested side. Fills immediately at the posted price (up to the
        available size) since the recovery engine needs deterministic execution.

        `odds` (decimal) is used to compute desiredOdds correctly:
          desiredOdds = 10^20 - best_maker_percentageOdds for the opposite outcome

        Raises RuntimeError if no fillable maker orders exist.
        Returns a fillHash / betId string on success.
        """
        # Re-fetch the live orderbook for the correct maker's percentageOdds
        # (do NOT use `odds` directly -- it's derived from an earlier get_quotes
        # call and the market may have moved; we need the current best maker pct).
        resp = self.session.get(
            f"{self.base_url}/orders/odds/best",
            params={"marketHashes": event_id, "baseToken": self.base_token},
            timeout=10,
        )
        resp.raise_for_status()
        best_odds_list = resp.json().get("data", {}).get("bestOdds", [])
        if not best_odds_list:
            raise RuntimeError(f"no liquidity on market {event_id}")

        entry = best_odds_list[0]
        # For a taker betting outcome one (Side.A), we fill against makers on
        # outcome two (and vice-versa).
        is_outcome_one = (side == Side.A)
        opposite_key = "outcomeTwo" if is_outcome_one else "outcomeOne"
        maker_pct_str = entry.get(opposite_key, {}).get("percentageOdds", "0")
        if maker_pct_str == "0":
            raise RuntimeError(
                f"no fillable maker orders for {side} on market {event_id}"
            )

        # taker desiredOdds = 10^20 - maker_percentageOdds (per SX docs)
        desired_odds_str = maker_pct_to_taker_desired_odds(maker_pct_str)

        # Scale stake to base token units (6 decimals for USDC)
        stake_wei = str(int(Decimal(str(stake)) * Decimal(10) ** self.token_decimals))
        fill_salt = int.from_bytes(secrets.token_bytes(32), "big")

        taker_sig = self._sign_fill(
            market_hash=event_id,
            base_token=self.base_token,
            is_taker_betting_outcome_one=is_outcome_one,
            stake_wei=stake_wei,
            desired_odds=desired_odds_str,
            fill_salt=fill_salt,
        )

        submit_payload = {
            "market": event_id,
            "baseToken": self.base_token,
            "isTakerBettingOutcomeOne": is_outcome_one,
            "stakeWei": stake_wei,
            "desiredOdds": desired_odds_str,
            "oddsSlippage": self.odds_slippage,
            "taker": self.address,
            "takerSig": taker_sig,
            "fillSalt": str(fill_salt),
            "message": "N/A",
        }

        try:
            resp = self.session.post(
                f"{self.base_url}/orders/fill/v2", json=submit_payload, timeout=30
            )
            resp.raise_for_status()
        except requests.exceptions.HTTPError as err:
            try:
                error_body = resp.json()
            except Exception:
                error_body = resp.text
            print(f"[-] SX Bet API returned HTTP {resp.status_code}: {error_body}")
            raise err
        result = resp.json()

        # The API returns the fill/bet identifier under data
        data = result.get("data") or {}
        fill_id = data.get("fillHash") or data.get("betId") or data.get("id")
        if not fill_id:
            raise RuntimeError(f"fill submitted but no ID returned: {result}")
        return fill_id

    def _sign_fill(
        self,
        market_hash: str,
        base_token: str,
        is_taker_betting_outcome_one: bool,
        stake_wei: str,
        desired_odds: str,
        fill_salt: int,
    ) -> str:
        """
        Sign the fill request with EIP-712 typed data.

        Domain and message structure verified against official SX Bet docs:
        https://docs.sx.bet/developers/filling-orders (Step 2: Sign and submit)

        The verifyingContract MUST come from GET /metadata -> EIP712FillHasher
        for the target network (testnet and mainnet use different addresses).
        """
        if Account is None:
            raise RuntimeError("eth-account is not installed")

        domain = {
            "name": "SX Bet",
            "version": self.domain_version,
            "chainId": self.chain_id,
            "verifyingContract": self.verifying_contract,
        }

        message = {
            "action": "N/A",
            "market": market_hash,
            "betting": "N/A",
            "stake": "N/A",
            "worstOdds": "N/A",
            "worstReturning": "N/A",
            "fills": {
                "stakeWei": stake_wei,
                "marketHash": market_hash,
                "baseToken": base_token,
                "desiredOdds": desired_odds,
                "oddsSlippage": self.odds_slippage,
                "isTakerBettingOutcomeOne": is_taker_betting_outcome_one,
                "fillSalt": fill_salt,
                "beneficiary": "0x0000000000000000000000000000000000000000",
                "beneficiaryType": 0,
                "cashOutTarget": b"\x00" * 32,
            },
        }

        signed = Account.sign_typed_data(
            self.account.key,
            domain_data=domain,
            message_types=FILL_TYPES,
            message_data=message,
        )
        return "0x" + signed.signature.hex()

    # ------------------------------------------------------------------
    # Settlement polling
    # ------------------------------------------------------------------

    def settle(self, event_id: str, bet_id: str) -> BetOutcome:
        """
        Poll GET /trades for the outcome of a previously submitted fill.

        SX trade lifecycle:
          PENDING  -> transaction has been submitted to the chain
          SUCCESS  -> transaction confirmed; trade is live
          FAILED   -> on-chain transaction failed (very rare: ~0.012% per SX docs)

        Market outcome (win/loss) is published once the event resolves,
        typically within seconds to minutes after the match ends.
        We poll on the `outcome` field (values: "WIN", "LOSS", "VOID" or absent
        while PENDING/SUCCESS-but-unsettled).

        Times out after ~5 minutes of polling (60 * 5s) and returns UNMATCHED
        so the engine can decide whether to retry or pause the line.
        """
        for attempt in range(60):
            try:
                resp = self.session.get(
                    f"{self.base_url}/trades",
                    params={"bettor": self.address},
                    timeout=10,
                )
                resp.raise_for_status()
                trades = resp.json().get("data", {}).get("trades", [])

                # Match our specific fill by fillHash / betId
                for trade in trades:
                    trade_id = (
                        trade.get("fillHash")
                        or trade.get("betId")
                        or trade.get("id")
                        or ""
                    )
                    if trade_id.lower() != bet_id.lower():
                        continue

                    trade_status = trade.get("tradeStatus", "").upper()
                    outcome_raw = (trade.get("outcome") or "").upper()

                    # If on-chain transaction failed, treat as unmatched
                    if trade_status == "FAILED":
                        return BetOutcome.UNMATCHED

                    # Outcome is set once the market resolves
                    if outcome_raw == "WIN":
                        return BetOutcome.WIN
                    if outcome_raw == "LOSS":
                        return BetOutcome.LOSS
                    if outcome_raw in ("VOID", "PUSH", "CANCELLED"):
                        return BetOutcome.VOID

                    # Trade found but outcome not yet published -- keep polling
                    break
                else:
                    # Our fill ID not yet in the trade list -- fill may still
                    # be queued (SX applies a short betting delay before matching)
                    pass

            except requests.RequestException as exc:
                print(f"[SXBetClient.settle] HTTP error on attempt {attempt}: {exc}")

            time.sleep(5)

        return BetOutcome.UNMATCHED

    def check_bet_status(self, bet_id: str) -> Optional[BetOutcome]:
        """
        Check the status of a specific bet_id (fillHash) on the SX Bet API.
        Non-blocking: queries once and returns the current outcome, or None if pending/unsettled.
        """
        try:
            resp = self.session.get(
                f"{self.base_url}/trades",
                params={"bettor": self.address},
                timeout=10,
            )
            resp.raise_for_status()
            trades = resp.json().get("data", {}).get("trades", [])

            for trade in trades:
                trade_id = (
                    trade.get("fillHash")
                    or trade.get("betId")
                    or trade.get("id")
                    or ""
                )
                if trade_id.lower() != bet_id.lower():
                    continue

                trade_status = trade.get("tradeStatus", "").upper()
                outcome_raw = (trade.get("outcome") or "").upper()

                if trade_status == "FAILED":
                    return BetOutcome.UNMATCHED

                if outcome_raw == "WIN":
                    return BetOutcome.WIN
                if outcome_raw == "LOSS":
                    return BetOutcome.LOSS
                if outcome_raw in ("VOID", "PUSH", "CANCELLED"):
                    return BetOutcome.VOID

                # Trade is active on-chain, but not yet settled/resolved
                return None

        except Exception as exc:
            print(f"[SXBetClient.check_bet_status] Error checking status for {bet_id}: {exc}")
            
        return None
