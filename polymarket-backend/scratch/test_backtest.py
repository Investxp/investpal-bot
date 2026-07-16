import sys
sys.path.append('.')
from server import run_24h_backtest, get_wallet_address_and_balance
import json

print("Running 24h Backtest with default settings...")
res = run_24h_backtest(base_stake=10.0, recovery_factor=2.0, max_steps=6, initial_bankroll=1000.0)
print("Backtest Result status:", res.get("ok"))
if res.get("ok"):
    print("Trades Run:", res.get("trades_run"))
    print("Win Rate:", res.get("win_rate"))
    print("Total PNL:", res.get("total_pnl"))
    print("Final Bankroll:", res.get("final_bankroll"))
    if res.get("trades"):
        print("First trade:", res.get("trades")[0])
else:
    print("Error:", res.get("error"))
