@echo off
rem Start the background server (hidden window) and open the studio page
cd /d "%~dp0"
wscript.exe "%~dp0run-hidden.vbs"
timeout /t 2 /nobreak >nul
start "" http://localhost:8768
