# =====================================================================
#  Instalador fácil del Centro de control de casa — WINDOWS
#  Hace solo todo lo necesario:
#    1. Instala Node.js si falta
#    2. Copia el programa a una carpeta fija (sin tocar tu configuración)
#    3. Abre el cortafuegos para que entre el móvil (y marca la Wi-Fi de casa como privada)
#    4. Lo deja arrancando solo al iniciar sesión + acceso directo en el escritorio
#    5. (Opcional) Evita que el PC se suspenda enchufado
#    6. Lo arranca y te dice la dirección para el iPhone
#  Sirve también para ACTUALIZAR: vuelve a ejecutarlo con la versión nueva.
# =====================================================================
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$REPO   = 'ezguum-zuri/centro-domotico'   # <-- usuario/repositorio de GitHub
$BRANCH = 'main'
$RULE   = 'Centro de control de casa'

try { $Host.UI.RawUI.WindowTitle = 'Instalar Centro de control de casa' } catch {}

function Paso($n, $t) { Write-Host ''; Write-Host "[$n/6] $t" -ForegroundColor Cyan }
function Ok($t)       { Write-Host "   OK  $t" -ForegroundColor Green }
function Aviso($t)    { Write-Host "   !   $t" -ForegroundColor Yellow }
function Fin($code)   { Write-Host ''; Read-Host 'Pulsa Enter para cerrar esta ventana' | Out-Null; exit $code }
function Fallo($t)    { Write-Host ''; Write-Host "   ERROR: $t" -ForegroundColor Red; Fin 1 }
function Pregunta($t) { $r = Read-Host "   $t (S/N)"; return ($r -match '^[sSyY]') }

function Buscar-Node {
  $c = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  return $null
}
function Version-Node($n) { try { return [int]((& $n -v).TrimStart('v').Split('.')[0]) } catch { return 0 } }

function Parar-Servidor($port) {
  try {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  } catch {}
}

try {
  Clear-Host
  Write-Host ''
  Write-Host '  ==============================================' -ForegroundColor Cyan
  Write-Host '     Instalador del Centro de control de casa'    -ForegroundColor Cyan
  Write-Host '  ==============================================' -ForegroundColor Cyan
  Write-Host '  Tardará un par de minutos. Si Windows pregunta'
  Write-Host '  "¿Quieres permitir que esta aplicación haga cambios?", pulsa Sí.'

  # ------------------------------------------------------------ 1. Node.js
  Paso 1 'Node.js'
  $node = Buscar-Node
  if (-not $node -or (Version-Node $node) -lt 18) {
    Write-Host '   Hace falta Node.js (gratuito). Lo descargo e instalo...'
    $lts  = Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object { $_.lts } | Select-Object -First 1
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $v    = $lts.version
    $msi  = Join-Path $env:TEMP "node-$v-$arch.msi"
    Invoke-WebRequest "https://nodejs.org/dist/$v/node-$v-$arch.msi" -OutFile $msi -UseBasicParsing
    Write-Host '   Instalando... (si Windows pide permiso, pulsa Sí)'
    $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /passive /norestart" -Wait -PassThru
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { Fallo "No se pudo instalar Node.js (código $($p.ExitCode)). Instálalo a mano desde https://nodejs.org (LTS) y vuelve a ejecutar este instalador." }
    Remove-Item $msi -ErrorAction SilentlyContinue
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    $node = Buscar-Node
    if (-not $node) { Fallo 'Node.js se ha instalado pero no lo encuentro. Reinicia el PC y vuelve a ejecutar el instalador.' }
  }
  Ok "Node.js $(& $node -v)"

  # ------------------------------------------------------------ 2. Programa
  Paso 2 'Copiando el programa'
  $startup = [Environment]::GetFolderPath('Startup')
  $vbs     = Join-Path $startup 'centro-domotico.vbs'
  $dest    = Join-Path $env:USERPROFILE 'centro-domotico'
  # Si ya estaba instalado (aunque sea en otra carpeta), se actualiza ese mismo
  if (Test-Path $vbs) {
    $m = Select-String -Path $vbs -Pattern 'CurrentDirectory = "(.+)"' -ErrorAction SilentlyContinue
    if ($m) { $prev = $m.Matches[0].Groups[1].Value; if (Test-Path (Join-Path $prev 'server.js')) { $dest = $prev } }
  }

  # ¿De dónde sale el programa? De la carpeta descargada o, si no, de GitHub
  $src = $null; $tmp = $null
  if ($PSScriptRoot) {
    $cand = Split-Path -Parent $PSScriptRoot
    if (Test-Path (Join-Path $cand 'server.js')) { $src = $cand }
  }
  if (-not $src) {
    Write-Host '   Descargando la última versión de GitHub...'
    $tmp = Join-Path $env:TEMP ('centro-domotico-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory $tmp | Out-Null
    $zip = Join-Path $tmp 'programa.zip'
    Invoke-WebRequest "https://github.com/$REPO/archive/refs/heads/$BRANCH.zip" -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $tmp
    $src = (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName
    if (-not (Test-Path (Join-Path $src 'server.js'))) { Fallo 'La descarga no contiene el programa.' }
  }

  # Puerto (por si alguien lo cambió en config.json)
  $port = 8080
  $cfgFile = Join-Path $dest 'config.json'
  if (Test-Path $cfgFile) { try { $c = Get-Content $cfgFile -Raw | ConvertFrom-Json; if ($c.port) { $port = [int]$c.port } } catch {} }

  Parar-Servidor $port
  $same = (Test-Path $dest) -and ((Resolve-Path $src).Path.TrimEnd('\') -eq (Resolve-Path $dest).Path.TrimEnd('\'))
  if (-not $same) {
    # Se copia todo MENOS tu configuración (config.json) y tus datos (data\)
    robocopy $src $dest /E /XD data .git node_modules /XF config.json /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { Fallo "No se pudieron copiar los archivos a $dest" }
  }
  New-Item -ItemType Directory (Join-Path $dest 'data') -Force | Out-Null
  Get-ChildItem $dest -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
  if ($tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  if (Test-Path $cfgFile) { Ok "Actualizado en $dest (tu configuración se conserva)" } else { Ok "Instalado en $dest" }

  # ------------------------------------------------------------ 3. Red / cortafuegos
  Paso 3 'Permiso para que entre el móvil'
  $admin = @()
  $rule = Get-NetFirewallRule -DisplayName $RULE -ErrorAction SilentlyContinue
  $ruleOk = $false
  if ($rule) { try { $ruleOk = ((($rule | Get-NetFirewallApplicationFilter).Program) -contains $node) } catch {} }
  $blocks = @()
  try { $blocks = @(Get-NetFirewallApplicationFilter -Program $node -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object { $_.Action -eq 'Block' }) } catch {}
  if (-not $ruleOk -or $blocks.Count) {
    $admin += "`$n = '$($node.Replace("'", "''"))'"
    $admin += "Get-NetFirewallApplicationFilter -Program `$n -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object { `$_.Action -eq 'Block' } | Remove-NetFirewallRule"
    $admin += "Remove-NetFirewallRule -DisplayName '$RULE' -ErrorAction SilentlyContinue"
    $admin += "New-NetFirewallRule -DisplayName '$RULE' -Direction Inbound -Program `$n -Action Allow -Profile Private | Out-Null"
  }
  $pub = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Public' })
  $quedaPublica = $false
  if ($pub.Count) {
    Aviso "Windows tiene la red '$($pub[0].Name)' marcada como PÚBLICA y así el móvil no puede entrar."
    if (Pregunta '¿Es la Wi-Fi de tu casa? Si dices S la marco como privada') {
      foreach ($x in $pub) { $admin += "Set-NetConnectionProfile -InterfaceIndex $($x.InterfaceIndex) -NetworkCategory Private" }
    } else { $quedaPublica = $true }
  }
  if ($admin.Count) {
    $f = Join-Path $env:TEMP 'centro-domotico-admin.ps1'
    Set-Content $f ($admin -join "`r`n") -Encoding UTF8
    Write-Host '   Windows te pedirá permiso: pulsa Sí.'
    try {
      Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$f`""
      Ok 'Cortafuegos preparado'
    } catch {
      Aviso 'No se dio permiso. Cuando Windows pregunte por "Node.js", marca "Redes privadas" y pulsa Permitir.'
    }
    Remove-Item $f -ErrorAction SilentlyContinue
  } else { Ok 'Ya estaba preparado' }
  if ($quedaPublica) { Aviso 'Con la red como pública el móvil no podrá conectarse. Vuelve a ejecutar el instalador en la Wi-Fi de casa.' }

  # ------------------------------------------------------------ 4. Arranque automático
  Paso 4 'Arranque automático al encender el PC'
  $cmd = 'cmd /c ""' + $node + '" server.js >> data\servidor.log 2>&1"'
  $lines = @(
    'Set sh = CreateObject("WScript.Shell")',
    ('sh.CurrentDirectory = "' + $dest + '"'),
    ('sh.Run "' + $cmd.Replace('"', '""') + '", 0, False')
  )
  Set-Content $vbs ($lines -join "`r`n") -Encoding Unicode
  Start-Process wscript.exe -ArgumentList "`"$vbs`""
  $desk = [Environment]::GetFolderPath('Desktop')
  Set-Content (Join-Path $desk 'Casa - Centro de control.url') "[InternetShortcut]`r`nURL=http://localhost:$port/" -Encoding ASCII
  Ok 'Arrancará solo cada vez que inicies sesión'
  Ok 'Acceso directo "Casa - Centro de control" en el escritorio'

  # ------------------------------------------------------------ 5. Suspensión
  Paso 5 'Que el PC no se duerma'
  Write-Host '   El programa solo funciona mientras el PC está encendido.'
  if (Pregunta '¿Quieres que el PC no se suspenda nunca mientras esté enchufado?') {
    $pc = 1
    try { powercfg.exe /change standby-timeout-ac 0 | Out-Null; $pc = $LASTEXITCODE } catch {}
    if ($pc -eq 0) { Ok 'Hecho (la pantalla sí se puede apagar)' } else { Aviso 'No se pudo. Hazlo en Configuración > Sistema > Inicio/apagado > Suspender: Nunca.' }
  } else { Aviso 'De acuerdo. Mientras el PC esté suspendido, el panel no responderá.' }

  # ------------------------------------------------------------ 6. Comprobación
  Paso 6 'Comprobando que funciona'
  $up = $false
  for ($i = 0; $i -lt 30 -and -not $up; $i++) {
    try { Invoke-WebRequest "http://localhost:$port/" -UseBasicParsing -TimeoutSec 3 | Out-Null; $up = $true } catch { Start-Sleep 1 }
  }
  if (-not $up) {
    $log = Join-Path $dest 'data\servidor.log'
    Aviso 'El programa no responde. Últimas líneas del registro:'
    if (Test-Path $log) { Get-Content $log -Tail 15 | ForEach-Object { Write-Host "      $_" } }
    Fallo 'Haz una foto de esta ventana y mándasela a quien te pasó el programa.'
  }
  Ok 'Funcionando'

  $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
      $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.InterfaceAlias -notmatch 'vEthernet|VirtualBox|VMware|Loopback|Bluetooth' } |
    Select-Object -ExpandProperty IPAddress)

  Write-Host ''
  Write-Host '  ==============================================' -ForegroundColor Green
  Write-Host '     ¡LISTO!' -ForegroundColor Green
  Write-Host '  ==============================================' -ForegroundColor Green
  Write-Host ''
  Write-Host "  En este PC:   http://localhost:$port   (o el icono del escritorio)"
  Write-Host ''
  Write-Host '  En el iPhone / iPad (conectado a la Wi-Fi de casa), abre Safari y escribe:'
  foreach ($ip in $ips) { Write-Host "        http://$($ip):$port" -ForegroundColor Yellow }
  Write-Host '  Luego: Compartir > Añadir a pantalla de inicio.'
  Write-Host ''
  Write-Host '  Consejo: si un día el móvil deja de conectar, el router ha cambiado'
  Write-Host '  la dirección del PC. Vuelve a ejecutar este instalador y te dirá la nueva.'
  Write-Host ''
  Write-Host '  Lo siguiente: en la pestaña Ajustes vincula Hue, tado y los enchufes.'
  Start-Process "http://localhost:$port/"
  Fin 0
}
catch {
  Fallo $_.Exception.Message
}
