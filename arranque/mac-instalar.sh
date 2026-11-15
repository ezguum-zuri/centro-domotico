#!/bin/bash
# Mac: arranca el centro de control al encender el ordenador (y lo reinicia si falla)
# Uso:  bash arranque/mac-instalar.sh        (desde la carpeta del programa)
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
PLIST="$HOME/Library/LaunchAgents/es.casa.centrodomotico.plist"
[ -z "$NODE" ] && { echo "❌ No encuentro Node.js. Instálalo desde https://nodejs.org (versión LTS)."; exit 1; }
case "$DIR" in */Downloads*|*/Descargas*|*/Desktop*|*/Escritorio*|*/Documents*|*/Documentos*)
  echo "⚠️  Mueve antes la carpeta del programa a tu carpeta de usuario (Finder → Ir → Inicio)"
  echo "   y vuelve a ejecutar este script desde allí."; exit 1;; esac
mkdir -p "$HOME/Library/LaunchAgents" "$DIR/data"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>es.casa.centrodomotico</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/server.js</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/data/servidor.log</string>
  <key>StandardErrorPath</key><string>$DIR/data/servidor.log</string>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null; launchctl load "$PLIST"; sleep 2
echo "✅ Listo. El centro de control arrancará solo al encender el Mac."
open "http://localhost:8080"
