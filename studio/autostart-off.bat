@echo off
rem Remove Mars68 RGB Studio from Windows startup
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Mars68 RGB Studio.vbs" 2>nul
echo Autostart disabled.
pause
