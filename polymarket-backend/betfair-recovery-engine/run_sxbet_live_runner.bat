@echo off
cd /d "c:\Users\SAMM\Desktop\INVESTPAL PROJECTS\INVESTPAL BETS\betfair-recovery-engine"
title SX Bet Live Runner
:loop
echo [%date% %time%] Starting SX Bet Live Runner...
.venv\Scripts\python.exe sxbet_live_runner.py
echo [%date% %time%] sxbet_live_runner.py crashed or stopped. Restarting in 5 seconds...
timeout /t 5
goto loop
