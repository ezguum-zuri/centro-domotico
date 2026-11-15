#!/bin/bash
# =====================================================================
#  Instalador fácil del Centro de control de casa — MAC y RASPBERRY PI
#
#  Opción A (sin descargar nada): abre Terminal y pega esta línea:
#    curl -fsSL https://raw.githubusercontent.com/ezguum-zuri/centro-domotico/main/instalar.sh | bash
#  Opción B: dentro de la carpeta descargada de GitHub:   bash instalar.sh
#
#  Hace solo: instala Node.js si falta, copia el programa a ~/centro-domotico
#  (sin tocar tu configuración), lo deja arrancando solo, abre el cortafuegos,
#  evita el reposo (Mac) y te dice la dirección para el iPhone.
#  Sirve también para ACTUALIZAR: vuelve a ejecutarlo.
# =====================================================================
set -u
REPO="ezguum-zuri/centro-domotico"   # <-- usuario/repositorio de GitHub
BRANCH="main"
OS="$(uname -s)"
TTY=/dev/tty

paso()  { printf "\n\033[1;36m[%s/6] %s\033[0m\n" "$1" "$2"; }
ok()    { printf "   \033[32m✔\033[0m %s\n" "$1"; }
aviso() { printf "   \033[33m!\033[0m %s\n" "$1"; }
fallo() { printf "\n   \033[31m✘ %s\033[0m\n\n" "$1"; exit 1; }
pregunta() { local r=""; printf "   %s (s/n): " "$1"; read -r r < "$TTY" || r=n; [[ "$r" =~ ^[sSyY] ]]; }

buscar_node() {
  local n
  for n in "$(command -v node 2>/dev/null)" /usr/local/bin/node /opt/homebrew/bin/node /usr/bin/node; do
    [ -n "$n" ] && [ -x "$n" ] && { echo "$n"; return; }
  done
}
version_node() { local v; v="$("$1" -v 2>/dev/null | sed 's/^v//; s/\..*//')"; echo "${v:-0}"; }

clear 2>/dev/null
printf "\n\033[1;36m  ==============================================\n     Instalador del Centro de control de casa\n  ==============================================\033[0m\n"
echo "  Tardará un par de minutos. Si te pide la contraseña del"
echo "  ordenador, escríbela (no se ve al escribir) y pulsa Enter."

# ------------------------------------------------------------ 1. Node.js
paso 1 "Node.js"
NODE="$(buscar_node)"
if [ -z "$NODE" ] || [ "$(version_node "$NODE")" -lt 18 ]; then
  echo "   Hace falta Node.js (gratuito). Lo descargo e instalo..."
  if [ "$OS" = Darwin ]; then
    V="$(curl -fsSL https://nodejs.org/dist/index.json | tr '{' '\n' | grep -v '"lts":false' | grep -o '"version":"v[0-9.]*"' | head -1 | cut -d'"' -f4)"
    [ -n "$V" ] || fallo "No puedo conectar con nodejs.org. ¿Hay Internet?"
    curl -fL --progress-bar -o /tmp/node-instalar.pkg "https://nodejs.org/dist/$V/node-$V.pkg" || fallo "No se pudo descargar Node.js"
    sudo installer -pkg /tmp/node-instalar.pkg -target / >/dev/null || fallo "No se pudo instalar Node.js. Instálalo desde https://nodejs.org (LTS) y repite."
    rm -f /tmp/node-instalar.pkg
  elif command -v apt-get >/dev/null; then
    sudo apt-get update -qq && sudo apt-get install -y -qq nodejs >/dev/null
    N="$(buscar_node)"
    if [ -z "$N" ] || [ "$(version_node "$N")" -lt 18 ]; then   # sistema antiguo: versión oficial
      curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - >/dev/null && sudo apt-get install -y -qq nodejs >/dev/null
    fi
  else
    fallo "Instala Node.js 18 o superior y vuelve a ejecutar el instalador."
  fi
  NODE="$(buscar_node)"
  [ -n "$NODE" ] && [ "$(version_node "$NODE")" -ge 18 ] || fallo "No se pudo instalar Node.js."
fi
NODE_REAL="$NODE"
[ -L "$NODE" ] && NODE_REAL="$(cd "$(dirname "$NODE")" && cd "$(dirname "$(readlink "$NODE")")" && pwd)/$(basename "$(readlink "$NODE")")"
ok "Node.js $("$NODE" -v)"

# ------------------------------------------------------------ 2. Programa
paso 2 "Copiando el programa"
PLIST="$HOME/Library/LaunchAgents/es.casa.centrodomotico.plist"
SERVICE="/etc/systemd/system/centro-domotico.service"
PREV=""
if [ "$OS" = Darwin ]; then
  [ -f "$PLIST" ] && PREV="$(/usr/libexec/PlistBuddy -c 'Print :WorkingDirectory' "$PLIST" 2>/dev/null)"
else
  [ -f "$SERVICE" ] && PREV="$(sed -n 's/^WorkingDirectory=//p' "$SERVICE")"
fi
DEST="$HOME/centro-domotico"
[ -n "$PREV" ] && [ -f "$PREV/server.js" ] && DEST="$PREV"   # si ya estaba, se actualiza ese

# ¿De dónde sale el programa? De esta carpeta o, si no, de GitHub
SRC=""; TMP=""
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd)"
[ -n "$HERE" ] && [ -f "$HERE/server.js" ] && SRC="$HERE"
if [ -z "$SRC" ]; then
  echo "   Descargando la última versión de GitHub..."
  TMP="$(mktemp -d)"
  curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" | tar -xz -C "$TMP" || fallo "No se pudo descargar el programa de GitHub."
  SRC="$(ls -d "$TMP"/*/ | head -1)"; SRC="${SRC%/}"
  [ -f "$SRC/server.js" ] || fallo "La descarga no contiene el programa."
fi

# Parar el que esté en marcha
if [ "$OS" = Darwin ]; then launchctl unload "$PLIST" 2>/dev/null
else sudo systemctl stop centro-domotico 2>/dev/null; fi

mkdir -p "$DEST/data"
if [ "$(cd "$SRC" && pwd -P)" != "$(cd "$DEST" && pwd -P)" ]; then
  # Se copia todo MENOS tu configuración (config.json) y tus datos (data/)
  (cd "$SRC" && tar --exclude=config.json --exclude=data --exclude=.git --exclude=node_modules -cf - .) | (cd "$DEST" && tar -xf -) \
    || fallo "No se pudieron copiar los archivos a $DEST"
fi
[ "$OS" = Darwin ] && xattr -dr com.apple.quarantine "$DEST" 2>/dev/null
[ -n "$TMP" ] && rm -rf "$TMP"
if [ -f "$DEST/config.json" ]; then ok "Actualizado en $DEST (tu configuración se conserva)"; else ok "Instalado en $DEST"; fi

PORT="$(sed -n 's/.*"port"[^0-9]*\([0-9][0-9]*\).*/\1/p' "$DEST/config.json" 2>/dev/null | head -1)"
PORT="${PORT:-8080}"

# ------------------------------------------------------------ 3. Arranque automático
paso 3 "Arranque automático al encender"
if [ "$OS" = Darwin ]; then
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>es.casa.centrodomotico</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DEST/server.js</string></array>
  <key>WorkingDirectory</key><string>$DEST</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DEST/data/servidor.log</string>
  <key>StandardErrorPath</key><string>$DEST/data/servidor.log</string>
</dict></plist>
PL
  launchctl load "$PLIST" || fallo "No se pudo activar el arranque automático."
else
  sudo tee "$SERVICE" >/dev/null <<SV
[Unit]
Description=Centro de control domotico
After=network-online.target
Wants=network-online.target
[Service]
User=${USER:-$(id -un)}
WorkingDirectory=$DEST
ExecStart=$NODE $DEST/server.js
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
SV
  sudo systemctl daemon-reload && sudo systemctl enable --now centro-domotico >/dev/null 2>&1 || fallo "No se pudo activar el servicio."
fi
ok "Arrancará solo cada vez que se encienda (y se reinicia solo si falla)"

# ------------------------------------------------------------ 4. Cortafuegos
paso 4 "Permiso para que entre el móvil"
if [ "$OS" = Darwin ]; then
  FW=/usr/libexec/ApplicationFirewall/socketfilterfw
  if "$FW" --getglobalstate 2>/dev/null | grep -qi "enabled"; then
    sudo "$FW" --add "$NODE_REAL" >/dev/null && sudo "$FW" --unblockapp "$NODE_REAL" >/dev/null
    ok "Node.js permitido en el cortafuegos del Mac"
  else ok "El cortafuegos del Mac está desactivado: no hace falta nada"; fi
else
  if command -v ufw >/dev/null && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
    sudo ufw allow "$PORT/tcp" >/dev/null; ok "Puerto $PORT abierto"
  else ok "No hace falta nada"; fi
fi

# ------------------------------------------------------------ 5. Reposo
paso 5 "Que el ordenador no se duerma"
if [ "$OS" = Darwin ]; then
  echo "   El programa solo funciona mientras el Mac está despierto."
  if pregunta "¿Quieres que el Mac no se duerma nunca mientras esté enchufado?"; then
    sudo pmset -c sleep 0 && ok "Hecho (la pantalla sí se apaga). Ojo: si cierras la tapa del portátil, se duerme igual."
  else aviso "De acuerdo. Mientras el Mac duerma, el panel no responderá."; fi
else ok "La Raspberry no se duerme: no hace falta nada"; fi

# ------------------------------------------------------------ 6. Comprobación
paso 6 "Comprobando que funciona"
UP=0
for _ in $(seq 1 30); do curl -fs -o /dev/null "http://localhost:$PORT/" && { UP=1; break; }; sleep 1; done
if [ "$UP" != 1 ]; then
  aviso "El programa no responde. Últimas líneas del registro:"
  if [ "$OS" = Darwin ]; then tail -n 15 "$DEST/data/servidor.log" 2>/dev/null | sed 's/^/      /'
  else sudo journalctl -u centro-domotico -n 15 --no-pager 2>/dev/null | sed 's/^/      /'; fi
  fallo "Haz una foto de esta ventana y mándasela a quien te pasó el programa."
fi
ok "Funcionando"

if [ "$OS" = Darwin ]; then
  NAME="$(scutil --get LocalHostName 2>/dev/null)"
  IPS="$(for i in en0 en1 en2; do ipconfig getifaddr $i 2>/dev/null; done)"
  cat > "$HOME/Desktop/Casa - Centro de control.webloc" 2>/dev/null <<WL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>URL</key><string>http://localhost:$PORT/</string></dict></plist>
WL
else
  NAME="$(hostname)"
  IPS="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.' )"
fi

printf "\n\033[1;32m  ==============================================\n     ¡LISTO!\n  ==============================================\033[0m\n\n"
[ "$OS" = Darwin ] && echo "  En este Mac:  http://localhost:$PORT   (o el icono del escritorio)" && echo
echo "  En el iPhone / iPad (conectado a la Wi-Fi de casa), abre Safari y escribe:"
[ -n "$NAME" ] && printf "        \033[1;33mhttp://%s.local:%s\033[0m\n" "$NAME" "$PORT"
for ip in $IPS; do printf "     o  http://%s:%s\n" "$ip" "$PORT"; done
echo "  Luego: Compartir > Añadir a pantalla de inicio."
echo
echo "  Lo siguiente: en la pestaña Ajustes vincula Hue, tado y los enchufes."
echo
[ "$OS" = Darwin ] && open "http://localhost:$PORT/"
exit 0
