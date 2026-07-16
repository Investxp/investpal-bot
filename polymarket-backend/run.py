#!/usr/bin/env python3
"""
InvestPal Polymarket Trade Engine
Usage: python run.py

Requirements:
  pip install requests py-clob-client python-dotenv
"""
import os, sys

# Load .env file if it exists
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("[INFO] .env loaded")
except ImportError:
    print("[WARN] python-dotenv not installed. Run: pip install python-dotenv")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from server import main

if __name__ == "__main__":
    main()
