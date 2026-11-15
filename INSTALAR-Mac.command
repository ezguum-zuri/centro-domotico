#!/bin/bash
# Doble clic aquí para instalar (o actualizar) el Centro de control de casa en el Mac
cd "$(dirname "$0")" || exit 1
bash ./instalar.sh
echo
read -r -p "Pulsa Enter para cerrar esta ventana..." _
