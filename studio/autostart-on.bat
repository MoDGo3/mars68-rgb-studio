@echo off
rem Start Mars68 RGB Studio background server automatically at Windows logon
set "DIR=%~dp0"
set "DIR=%DIR:~0,-1%"
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Mars68 RGB Studio.vbs"
(
  echo Set sh = CreateObject^("WScript.Shell"^)
  echo sh.CurrentDirectory = "%DIR%"
  echo sh.Run "node ""%DIR%\server.js""", 0, False
) > "%LNK%"
echo Autostart enabled: %LNK%
pause
