param([string]$Target = 'x86_64-pc-windows-msvc')
$ErrorActionPreference = 'Stop'
$release = Join-Path $PSScriptRoot "../src-tauri/target/$Target/release"
$setup = Get-ChildItem "$release/bundle/nsis/*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$msi = Get-ChildItem "$release/bundle/msi/*.msi" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (!$setup -or !$msi) { throw 'Both setup EXE and MSI installers are required.' }

# Inspect the real compiled payload, rather than just trusting the config file.
$extract = Join-Path $env:RUNNER_TEMP 'PhotoRequest-installer-payload'
& 7z x $setup.FullName "-o$extract" -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the setup payload.' }
$runtime = Get-ChildItem $extract -Recurse -Filter MicrosoftEdgeWebView2RuntimeInstaller.exe | Select-Object -First 1
if (!$runtime -or $runtime.Length -lt 20MB) { throw 'The full offline WebView2 runtime is missing from the setup EXE.' }
$signature = Get-AuthenticodeSignature $runtime.FullName
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
  throw "The bundled runtime is not a valid Microsoft-signed installer: $($signature.Status)"
}
$msiFiles = (& 7z l $msi.FullName | Out-String)
if ($LASTEXITCODE -ne 0 -or $msiFiles -notmatch 'MicrosoftEdgeWebView2RuntimeInstaller') { throw 'The MSI does not contain the offline runtime.' }

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$visualStudio = & $vswhere -latest -products '*' -property installationPath
$dumpbin = Get-ChildItem "$visualStudio/VC/Tools/MSVC/*/bin/Hostx64/x64/dumpbin.exe" | Sort-Object FullName -Descending | Select-Object -First 1
if (!$dumpbin) { throw 'Cannot inspect executable dependencies: dumpbin is missing on the build runner.' }
$dependencies = (& $dumpbin.FullName /DEPENDENTS "$release/photorequest.exe" | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect application dependencies.' }
if ($dependencies -match '(?i)\b(vcruntime\d+|msvcp\d+|concrt\d+)[^\s]*\.dll\b') { throw 'The app still requires a separately installed C++ runtime.' }

# The hosted runner already has WebView2. This verifies per-user installation
# and native launch, not the fresh-machine/missing-runtime branch.
$install = Join-Path $env:RUNNER_TEMP 'PhotoRequest-install-check'
$setupProcess = Start-Process $setup.FullName -ArgumentList @('/S', "/D=$install") -PassThru
if (!$setupProcess.WaitForExit(180000)) { $setupProcess.Kill(); throw 'The silent installer did not finish within three minutes.' }
$setupProcess.Refresh()
if ($setupProcess.ExitCode -ne 0) { throw "Setup failed with code $($setupProcess.ExitCode)." }
$appPath = Join-Path $install 'photorequest.exe'
if (!(Test-Path $appPath) -or !(Test-Path (Join-Path $install 'INSTALLATION.txt'))) { throw 'The app or its offline installation help was not installed.' }
$started = Get-Date
$app = Start-Process $appPath -PassThru
try {
  Start-Sleep -Seconds 7
  $app.Refresh()
  $logs = @(Get-ChildItem $env:TEMP -Filter 'PhotoRequest-startup-*.txt' | Where-Object { $_.LastWriteTime -ge $started })
  if ($logs.Count -gt 0) { throw ('Native startup failed: ' + (Get-Content $logs[0].FullName -Raw)) }
  if ($app.HasExited) { throw "The installed app exited during startup with code $($app.ExitCode)." }
  if ($app.MainWindowHandle -eq 0) { throw 'The installed app did not create its main window.' }
  Write-Output 'Verified Microsoft offline runtime signature, EXE/MSI payloads, static C++ linkage, per-user setup, bundled help, and installed-app launch.'
} finally {
  if (!$app.HasExited) {
    [void]$app.CloseMainWindow()
    if (!$app.WaitForExit(10000)) { $app.Kill() }
  }
}
