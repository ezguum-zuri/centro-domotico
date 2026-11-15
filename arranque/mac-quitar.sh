#!/bin/bash
PLIST="$HOME/Library/LaunchAgents/es.casa.centrodomotico.plist"
launchctl unload "$PLIST" 2>/dev/null; rm -f "$PLIST"
echo "Arranque automático quitado."
