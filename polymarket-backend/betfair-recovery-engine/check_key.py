"""
check_key.py — Derives the wallet address from each private key in .env
and tells you which one matches the SX Bet testnet wallet.

Run: python check_key.py
"""
import os
import sys

TARGET_ADDRESS = "0xc0A0c47B4C62112D9AaC1265a59676e59AdA728F"

# Load .env
env_path = os.path.join(os.path.dirname(__file__), ".env")
env_vars = {}
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env_vars[k.strip()] = v.strip()

key1 = env_vars.get("SX_PRIVATE_KEY_1", "")
key2 = env_vars.get("SX_PRIVATE_KEY_2", "")

try:
    from eth_account import Account
except ImportError:
    print("eth-account not found. Run from the project venv:")
    print(r"  .venv\Scripts\python.exe check_key.py")
    sys.exit(1)

print(f"\nTarget wallet : {TARGET_ADDRESS}\n")
print("=" * 60)

matched_key = None

for label, raw_key in [("Key 1", key1), ("Key 2", key2)]:
    if not raw_key or raw_key.startswith("PASTE_"):
        print(f"{label}: (not filled in yet)")
        continue
    try:
        acct = Account.from_key(raw_key)
        addr = acct.address
        match = addr.lower() == TARGET_ADDRESS.lower()
        status = "*** MATCH ***" if match else "no match"
        print(f"{label}: {addr}  <-- {status}")
        if match:
            matched_key = label
    except Exception as e:
        print(f"{label}: ERROR — {e}")

print("=" * 60)
if matched_key:
    print(f"\nResult: {matched_key} is the correct key for this wallet.")
    print("Updating SX_PRIVATE_KEY in .env automatically...")

    # Write the matched key as SX_PRIVATE_KEY
    winning_key = key1 if matched_key == "Key 1" else key2
    lines = open(env_path).readlines()
    updated = False
    new_lines = []
    for line in lines:
        if line.startswith("SX_PRIVATE_KEY=") or line.startswith("# SX_PRIVATE_KEY="):
            continue  # remove old entry if any
        new_lines.append(line)

    # Append the active key
    new_lines.append(f"\n# Active key (auto-set by check_key.py)\n")
    new_lines.append(f"SX_PRIVATE_KEY={winning_key}\n")
    with open(env_path, "w") as f:
        f.writelines(new_lines)
    print(f"Done. SX_PRIVATE_KEY is now set in .env")
    print(f"\nNext step: run the live fill test:")
    print(r"  .venv\Scripts\python.exe test_live_fill.py")
else:
    if key1 or key2:
        print("\nNeither key matched the target wallet address.")
        print("Check that you exported the key for account:")
        print(f"  {TARGET_ADDRESS}")
    else:
        print("\nNo keys entered yet. Edit .env and paste both keys, then re-run.")
