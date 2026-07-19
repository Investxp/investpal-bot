"""
test_live_fill.py — End-to-end live test against SX Bet Toronto testnet.

What this does:
  1. Loads your private key from .env
  2. Fetches live markets from testnet
  3. Gets live quotes (odds) for the first available market
  4. Places a 1 USDC taker fill on that market
  5. Polls settle() until the trade is confirmed on-chain
  6. Prints the fill hash and outcome

Run: python test_live_fill.py
Safe: uses testnet only, minimum stake (1 USDC)
"""
import os
import sys
import time

# Load from .env file
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip())

PRIVATE_KEY = os.environ.get("SX_PRIVATE_KEY", "")
if not PRIVATE_KEY or PRIVATE_KEY == "PASTE_YOUR_PRIVATE_KEY_HERE":
    print("ERROR: Set SX_PRIVATE_KEY in .env first.")
    print(f"  Edit: {env_path}")
    sys.exit(1)

import requests
from sxbet_client import SXBetClient, from_api_percentage_odds

API_URL = "https://api.toronto.sx.bet"
STAKE_USDC = 1.0  # minimum 1 USDC taker stake

def find_liquid_market(client):
    """Scan active markets until we find one with >= STAKE_USDC liquidity on either side."""
    from models import Side
    
    # Try the known UEFA Nations League market first to save time and avoid API timeouts
    known_hash = "0xa16241ffde384571b9b6caad3117984c3083be6a9171997e40ca002dfadefcf3"
    print(f"Trying known fallback market first: {known_hash}")
    try:
        quotes = client.get_quotes(known_hash)
        qa = quotes[Side.A]
        qb = quotes[Side.B]
        best_vol = max(qa.matched_volume, qb.matched_volume)
        if best_vol >= STAKE_USDC:
            print("  Found liquidity on known fallback market!")
            print(f"    Side A   : {qa.decimal_odds:.4f} odds, {qa.matched_volume:.2f} USDC")
            print(f"    Side B   : {qb.decimal_odds:.4f} odds, {qb.matched_volume:.2f} USDC")
            market = {
                "marketHash": known_hash,
                "sportXeventId": "L18654235",
                "eventId": "L18654235"
            }
            return market, quotes
    except Exception as e:
        print(f"  Failed to query known fallback market: {e}")

    print("Fetching active markets and scanning for liquidity...")
    resp = requests.get(f"{API_URL}/markets/active", timeout=10)
    resp.raise_for_status()
    markets = resp.json().get("data", {}).get("markets", [])
    print(f"  Found {len(markets)} active markets — scanning for liquidity...")

    for i, market in enumerate(markets):
        mh = market.get("marketHash")
        try:
            quotes = client.get_quotes(mh)
            qa = quotes[Side.A]
            qb = quotes[Side.B]
            best_vol = max(qa.matched_volume, qb.matched_volume)
            if best_vol >= STAKE_USDC:
                print(f"  Found liquid market at index {i}: {mh}")
                print(f"    Event ID : {market.get('sportXeventId') or market.get('eventId')}")
                print(f"    Side A   : {qa.decimal_odds:.4f} odds, {qa.matched_volume:.2f} USDC")
                print(f"    Side B   : {qb.decimal_odds:.4f} odds, {qb.matched_volume:.2f} USDC")
                return market, quotes
        except Exception:
            continue

    return None, None

def main():
    print("=" * 60)
    print("SX Bet Testnet Live Fill Test")
    print("=" * 60)

    # 1. Initialise client (fetches metadata / EIP712FillHasher)
    print("\n[1] Initialising SXBetClient (testnet)...")
    client = SXBetClient(private_key=PRIVATE_KEY, testnet=True)
    print(f"    Wallet address : {client.address}")
    print(f"    Chain ID       : {client.chain_id}")
    print(f"    USDC token     : {client.base_token}")
    print(f"    Verifying ctr  : {client.verifying_contract}")
    print(f"    Domain version : {client.domain_version}")

    # 2. Find a liquid market
    print("\n[2] Scanning for a liquid market...")
    from models import Side
    market, quotes = find_liquid_market(client)
    if not market:
        print("    No liquid markets found among the first 50. Try again later.")
        sys.exit(1)

    market_hash = market.get("marketHash")
    qa = quotes[Side.A]
    qb = quotes[Side.B]

    # Choose the side with the most liquidity
    if qa.matched_volume >= STAKE_USDC and qb.matched_volume >= STAKE_USDC:
        # Both sides liquid — pick better odds
        side = Side.A if qa.decimal_odds >= qb.decimal_odds else Side.B
    elif qa.matched_volume >= STAKE_USDC:
        side = Side.A
    else:
        side = Side.B

    chosen = quotes[side]
    print(f"\n    Chosen side: {side.value}  ({chosen.decimal_odds:.4f} odds)")

    # 4. Place the fill
    print(f"\n[4] Placing {STAKE_USDC} USDC taker fill...")
    fill_hash = client.place_back_bet(
        event_id=market_hash,
        side=side,
        stake=STAKE_USDC,
        odds=chosen.decimal_odds,
    )
    print(f"    Fill submitted!")
    print(f"    Fill Hash: {fill_hash}")

    # 5. Confirm on-chain (tradeStatus: SUCCESS)
    print("\n[5] Polling for on-chain confirmation (up to 60s)...")
    for i in range(12):
        time.sleep(5)
        resp = requests.get(f"{API_URL}/trades", params={"bettor": client.address}, timeout=10)
        trades = resp.json().get("data", {}).get("trades", [])
        for t in trades:
            tid = t.get("fillHash") or t.get("betId") or ""
            if tid.lower() == fill_hash.lower():
                status = t.get("tradeStatus", "UNKNOWN")
                print(f"    [{i+1}] tradeStatus: {status}")
                if status == "SUCCESS":
                    print("\n    *** Trade confirmed on-chain! ***")
                    print(f"    Fill Hash   : {fill_hash}")
                    print(f"    Stake       : {float(t.get('stake',0))/1e6:.2f} USDC")
                    print(f"    Net Return  : {t.get('netReturn')} USDC (if win)")
                    print(f"    Settled     : {t.get('settled')}")
                    print(f"    Outcome     : {t.get('outcome') or 'pending (market not resolved yet)'}")
                    print("\nDONE. Full engine -> sign -> fill -> confirmation cycle verified.")
                    return
                elif status == "FAILED":
                    print("\n    Trade FAILED on-chain. Check balance and approval status.")
                    sys.exit(1)
                break
        else:
            print(f"    [{i+1}] Trade not yet visible in /trades, waiting...")

    print("\n    Timed out waiting for confirmation. Check the fill manually:")
    print(f"    https://explorerl2.toronto.sx.technology/tx/{fill_hash}")

if __name__ == "__main__":
    main()
