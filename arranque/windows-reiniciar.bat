@echo off
rem Reinicia el centro de control (por ejemplo, despues de actualizar)
taskkill /f /im node.exe >nul 2>nul
wscript "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\centro-domotico.vbs"
echo Reiniciado.
timeout /t 2 >nul
