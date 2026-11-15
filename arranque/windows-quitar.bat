@echo off
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\centro-domotico.vbs" 2>nul
taskkill /f /im node.exe >nul 2>nul
echo Arranque automatico quitado (y programa detenido).
pause
