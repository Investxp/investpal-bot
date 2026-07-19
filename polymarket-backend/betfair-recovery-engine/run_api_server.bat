@echo off
cd /d "c:\Users\SAMM\Desktop\INVESTPAL PROJECTS\INVESTPAL BETS\betfair-recovery-engine"
title Flask API Server
:loop
echo [%date% %time%] Starting Flask API Server...
.venv\Scripts\python.exe api_server.py
echo [%date% %time%] api_server.py crashed or stopped. Restarting in 5 seconds...
timeout /t 5
goto loop
