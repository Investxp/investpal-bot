"""
BetfairClient: thin wrapper around betfairlightweight.

Two implementations sharing the same interface:
  - LiveBetfairClient   -- real account, real money. Needs credentials.
  - DryRunBetfairClient -- synthetic odds/fills, zero account needed.
    Used by simulate.py to validate engine logic before going live.

Swap one for the other without touching RecoveryEngine or StakeCalculator.
"""
import random
from abc import ABC, abstractmethod
from typing import Optional

from models import BetOutcome, Side
from stake_calculator import OddsQuote

try:
    import betfairlightweight as bfl
except ImportError:  # pragma: no cover
    bfl = None


class BetfairClientBase(ABC):
    @abstractmethod
    def get_quotes(self, event_id: str) -> dict:
        """Return {Side.A: OddsQuote, Side.B: OddsQuote} for an event."""

    @abstractmethod
    def place_back_bet(self, event_id: str, side: Side, stake: float, odds: float) -> str:
        """Place a back order, return a bet_id."""

    @abstractmethod
    def settle(self, event_id: str, bet_id: str) -> BetOutcome:
        """Block/poll until the market settles; return the outcome."""


class LiveBetfairClient(BetfairClientBase):
    """
    Real account wrapper. Requires:
      - app_key (delayed key for read-only testing; live key for real execution)
      - either username+password (interactive login) or ssl_cert/ssl_key
        (certificate-based, non-interactive -- recommended for an unattended bot)

    This class deliberately does NOT auto-login on construction. Call
    `login()` explicitly so credential errors surface clearly, not buried
    inside engine startup.
    """

    def __init__(self, app_key: str, username: Optional[str] = None,
                 password: Optional[str] = None, cert_files: Optional[tuple] = None,
                 locale: str = "uk"):
        if bfl is None:
            raise RuntimeError("betfairlightweight is not installed")
        self.app_key = app_key
        self.username = username
        self.password = password
        self.cert_files = cert_files  # (cert_path, key_path) for certificate login
        self.trading: Optional["bfl.APIClient"] = None

    def login(self):
        self.trading = bfl.APIClient(
            username=self.username,
            password=self.password,
            app_key=self.app_key,
            certs=self.cert_files[0] if self.cert_files else None,
            lightweight=False,
        )
        if self.cert_files:
            self.trading.login()  # certificate-based, non-interactive
        else:
            self.trading.login_interactive()
        return self.trading.session_token is not None

    def get_quotes(self, event_id: str) -> dict:
        # Real implementation calls listMarketBook for the market backing
        # event_id and maps runners to Side.A / Side.B per the LineConfig's
        # selection mapping. Left as a clear extension point: the exact
        # runner -> Side mapping depends on market_type (Match Odds vs
        # Over/Under vs Asian Handicap each structure runners differently).
        raise NotImplementedError(
            "Wire up listMarketBook + runner->Side mapping once a market_type "
            "selection map is defined for your chosen sports/markets."
        )

    def place_back_bet(self, event_id: str, side: Side, stake: float, odds: float) -> str:
        raise NotImplementedError("Wire up placeOrders once market/selection mapping exists.")

    def settle(self, event_id: str, bet_id: str) -> BetOutcome:
        raise NotImplementedError("Wire up listClearedOrders polling once live.")


class DryRunBetfairClient(BetfairClientBase):
    """
    Synthetic exchange for testing the recovery engine end-to-end with zero
    account, zero credentials, zero real money. Generates plausible decimal
    odds and resolves outcomes with matching implied probability, so the
    long-run win rate is consistent with the odds (no built-in edge either
    way -- this is for validating *engine* correctness, not predicting
    real-world profitability).
    """

    def __init__(self, seed: Optional[int] = None, base_volume: float = 1500.0):
        self.rng = random.Random(seed)
        self.base_volume = base_volume
        self._pending = {}  # bet_id -> (side, odds)

    def get_quotes(self, event_id: str) -> dict:
        odds_a = round(self.rng.uniform(1.5, 3.2), 2)
        # Roughly invert for side B with a bookmaker-style overround (~105%)
        implied_a = 1 / odds_a
        implied_b = max(0.05, 1.05 - implied_a)
        odds_b = round(1 / implied_b, 2)
        vol_a = max(50.0, self.rng.gauss(self.base_volume, self.base_volume * 0.4))
        vol_b = max(50.0, self.rng.gauss(self.base_volume, self.base_volume * 0.4))
        return {
            Side.A: OddsQuote(Side.A, odds_a, vol_a),
            Side.B: OddsQuote(Side.B, odds_b, vol_b),
        }

    def place_back_bet(self, event_id: str, side: Side, stake: float, odds: float) -> str:
        bet_id = f"dry-{event_id}-{side.value}-{len(self._pending)}"
        self._pending[bet_id] = (side, odds)
        return bet_id

    def settle(self, event_id: str, bet_id: str) -> BetOutcome:
        side, odds = self._pending.pop(bet_id)
        implied_prob = 1 / odds
        won = self.rng.random() < implied_prob
        return BetOutcome.WIN if won else BetOutcome.LOSS
