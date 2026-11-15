#!/bin/bash
# Reinicia el centro de control (por ejemplo, después de actualizar)
launchctl kickstart -k gui/$(id -u)/es.casa.centrodomotico && echo "✅ Reiniciado"
