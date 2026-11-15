# 🏠 Centro de control de casa

![Panel del centro de control](docs/captura.png)

Panel para el móvil y el ordenador que junta en un solo sitio:

- 💡 **Luces Philips Hue** (encender, apagar, brillo por habitación)
- 🌡️ **Calefacción tado° X** (temperatura, subir/bajar, volver al horario)
- 🔌 **Enchufes Shelly**: cuánto gasta cada aparato y **cuánto cuesta en euros** al día y al mes
- ⚡ **Precio de la luz** de cada hora (PVPC) o tu tarifa fija / de 3 tramos
- 📊 **Consumo de toda la casa** con el archivo de tu distribuidora y **comparador de tarifas** con tu consumo real

No hace falta tener todo: usa lo que tengas (solo luces, solo enchufes…).

---

## ¿Cómo funciona?

El programa se instala en **un ordenador de tu casa que esté siempre encendido** (o casi) y desde ahí habla con tus aparatos por la Wi-Fi. Luego lo abres desde el iPhone, iPad u ordenador **conectados a la Wi-Fi de casa**.

| Si tienes… | Dónde instalarlo |
|---|---|
| Un **PC con Windows** | En el PC → [Instalación en Windows](#-windows) |
| Un **Mac** | En el Mac → [Instalación en Mac](#-mac) |
| **Solo iPhone / iPad** | Un iPhone o iPad no puede tenerlo funcionando siempre. Necesitas una **Raspberry Pi** (unos 60–80 €, gasta 3 W) → [Raspberry Pi](#-raspberry-pi) |

> Tus datos (claves de Hue y tado, consumos) se guardan **solo en tu ordenador**, en `config.json` y la carpeta `data/`. No se envían a ningún sitio.

---

## 1. Descargar el programa

1. En esta página de GitHub, pulsa el botón verde **Code → Download ZIP**.
2. Descomprime el ZIP y **mueve la carpeta** a un sitio fijo:
   - **Windows:** por ejemplo `C:\centro-domotico`
   - **Mac:** tu carpeta de usuario (Finder → Ir → Inicio). No la dejes en Descargas, Escritorio ni Documentos.

## 2. Instalar Node.js

Descárgalo de **https://nodejs.org** → versión **LTS** → instalar con todas las opciones por defecto.
(Es gratis y de código abierto. Solo hace falta una vez.)

---

## 🪟 Windows

1. Abre la carpeta del programa, escribe `cmd` en la barra de dirección del Explorador y pulsa Enter.
2. En la ventana negra escribe: `node server.js`
3. **Muy importante la primera vez:** Windows preguntará si permites a Node.js acceder a la red → marca **Redes privadas** → **Permitir**. (Si no, el móvil no podrá conectarse.)
4. Abre en el navegador **http://localhost:8080**. Si funciona, cierra la ventana negra.
5. Para que arranque solo al encender el PC: entra en la carpeta **`arranque`** y haz doble clic en **`windows-instalar.bat`**.
   - Para quitarlo: `windows-quitar.bat` · Para reiniciarlo tras actualizar: `windows-reiniciar.bat`
6. Para que el PC no se duerma: **Configuración → Sistema → Inicio/apagado y batería → Suspender: Nunca** (al menos con el cargador conectado).

## 🍎 Mac

1. Abre la app **Terminal**, escribe `cd ` (con espacio), **arrastra la carpeta del programa** a la ventana y pulsa Enter.
2. Escribe: `bash arranque/mac-instalar.sh` y pulsa Enter. Se abrirá el panel en el navegador.
   - Si macOS pregunta si permites conexiones entrantes a "node" → **Permitir**.
   - Para quitarlo: `bash arranque/mac-quitar.sh` · Para reiniciarlo: `bash arranque/mac-reiniciar.sh`
3. Para que el Mac no se duerma enchufado: **Ajustes del Sistema → Batería → Opciones → Evitar reposo automático con el adaptador**.

## 🍓 Raspberry Pi

1. Prepara la Raspberry con **Raspberry Pi Imager** (sistema "Raspberry Pi OS Lite"), poniendo tu Wi-Fi y activando SSH.
2. Copia la carpeta del programa a la Raspberry y, dentro de ella, ejecuta: `bash arranque/raspberry-instalar.sh`
3. Al terminar te dirá la dirección para abrirlo desde el móvil.

---

## 📱 Abrirlo desde el iPhone / iPad

Con el móvil en la **Wi-Fi de casa**, abre en Safari la dirección del ordenador:

- **Mac / Raspberry:** `http://NOMBRE-DEL-EQUIPO.local:8080` (el nombre sale al instalar)
- **Windows:** `http://IP-DEL-PC:8080` (la IP la ves con `ipconfig` en `cmd`, línea "Dirección IPv4")

Luego **Compartir → Añadir a pantalla de inicio** y queda como una app.

En el móvil el menú sale abajo; en el ordenador o el iPad en horizontal, como barra lateral.

---

## ⚙️ Configurar (pestaña Ajustes)

**Tarifa de la luz**: elige PVPC, 3 tramos (pon tus precios de punta/llano/valle) o precio único. Los precios están en tu factura ("término de energía", sin impuestos).

**Philips Hue**: pulsa *Buscar*, aprieta el botón redondo del Bridge y en menos de 30 s pulsa *Vincular Bridge*.

**Enchufes Shelly** (modelos Gen3/Gen4, p. ej. *Shelly Plug M Gen3*):
1. Primero conéctalos a tu Wi-Fi. Lo más fácil: **app Casa del iPhone → + → Añadir accesorio → escanear el QR** del enchufe (necesitas un HomePod o Apple TV en casa). También vale la app *Shelly Smart Control*.
2. En el panel pulsa **🔍 Buscar enchufes en la red**, pulsa **Añadir** en cada uno, ponle nombre y guarda. Para saber cuál es cuál, mira los vatios que marca o apaga uno desde la app Casa y vuelve a buscar.
3. Marca **"Pedir confirmación antes de apagar"** en nevera, lavadora, etc., y **"Detectar cada uso y su coste"** en lavadora, lavavajillas o secadora.
4. Si el router le cambia la IP a un enchufe, el panel lo vuelve a encontrar solo.

> ⚠️ Nevera, congelador: no los apagues nunca desde el panel. Cinta de correr o aparatos con motor potente: mejor directos a la pared, sin enchufe inteligente.

**tado° X**: *Vincular cuenta tado* → inicia sesión en la web de tado y confirma el código. Sin suscripción, tado permite ~100 consultas al día, por eso se actualiza cada hora.

**Consumo de toda la casa (pestaña Consumo)**: descarga de la web de tu distribuidora el archivo de **consumo horario / curvas de carga** (i-DE: Área Privada → Gestiones; e-distribución, UFD… tienen opciones parecidas) y súbelo con *Importar archivo CSV*. En *Ofertas a comparar* pon las tarifas que te ofrezcan y verás cuál te sale más barata con tu consumo real, incluido el PVPC hora a hora.

---

## 🔄 Actualizar a una versión nueva

1. Descarga de nuevo el ZIP de GitHub.
2. Copia **solo** `server.js` y las carpetas `lib`, `public` y `arranque` encima de las tuyas. **No borres** `config.json` ni `data/`: ahí está tu configuración.
3. Reinicia: `windows-reiniciar.bat` (Windows) · `bash arranque/mac-reiniciar.sh` (Mac) · `sudo systemctl restart centro-domotico` (Raspberry).
4. Si en el móvil sigue saliendo el diseño anterior, cierra la app y vuelve a abrirla.

## 🧪 Probarlo sin aparatos

`DEMO=1 node server.js` (Mac/Raspberry) o `set DEMO=1 && node server.js` (Windows) y abre http://localhost:8080.

---

### Para quien suba esto a GitHub

El archivo `.gitignore` evita que se suban `config.json` y `data/`. **Nunca subas tu propia carpeta de uso diario a mano**: sube solo los archivos del programa.
