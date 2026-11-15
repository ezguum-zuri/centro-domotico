@echo off
chcp 65001 >nul
rem Windows: arranca el centro de control (oculto) cada vez que inicias sesion
set "DIR=%~dp0.."
for %%I in ("%DIR%") do set "DIR=%%~fI"
where node >nul 2>nul || (echo No encuentro Node.js. Instalalo desde https://nodejs.org ^(version LTS^) & pause & exit /b 1)
if not exist "%DIR%\data" mkdir "%DIR%\data"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
(
  echo Set sh = CreateObject("WScript.Shell"^)
  echo sh.CurrentDirectory = "%DIR%"
  echo sh.Run "cmd /c node server.js ^>^> data\servidor.log 2^>^&1", 0, False
) > "%STARTUP%\centro-domotico.vbs"
wscript "%STARTUP%\centro-domotico.vbs"
timeout /t 3 >nul
start http://localhost:8080
echo.
echo Listo. El centro de control arrancara solo cada vez que inicies sesion en Windows.
pause
