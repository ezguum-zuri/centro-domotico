#!/bin/bash
# Raspberry Pi (Raspberry Pi OS): instala Node.js si falta y deja el programa como servicio
# Uso:  bash arranque/raspberry-instalar.sh   (desde la carpeta del programa)
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
if ! command -v node >/dev/null; then sudo apt-get update && sudo apt-get install -y nodejs; fi
NODE="$(command -v node)"
mkdir -p "$DIR/data"
sudo tee /etc/systemd/system/centro-domotico.service >/dev/null <<SV
[Unit]
Description=Centro de control domotico
After=network-online.target
Wants=network-online.target
[Service]
User=$USER
WorkingDirectory=$DIR
ExecStart=$NODE $DIR/server.js
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
SV
sudo systemctl daemon-reload
sudo systemctl enable --now centro-domotico
echo "✅ Listo. Abre en el móvil: http://$(hostname).local:8080  o  http://$(hostname -I | awk '{print $1}'):8080"
