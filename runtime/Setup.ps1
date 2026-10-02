param([switch]$Voice)
$ErrorActionPreference='Stop'
$data=if($env:COUCOU_DATA_DIR){$env:COUCOU_DATA_DIR}else{Join-Path $env:LOCALAPPDATA 'Karbs'}
$env:COUCOU_DATA_DIR=$data
$env:KARBS_ROOT=$PSScriptRoot
$env:TEMP=Join-Path $data 'temp';$env:TMP=$env:TEMP
New-Item -ItemType Directory -Path $data,$env:TEMP,(Join-Path $data 'tools'),(Join-Path $data 'config') -Force | Out-Null
$manifest=Get-Content (Join-Path $PSScriptRoot 'dependencies.json') -Raw | ConvertFrom-Json
function Get-VerifiedArchive($item,$target){
 $archive=Join-Path $env:TEMP ($item.file)
 Invoke-WebRequest -Uri $item.url -OutFile $archive -UseBasicParsing
 if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $item.sha256){Remove-Item -LiteralPath $archive;throw 'Component checksum verification failed.'}
 New-Item -ItemType Directory -Path $target -Force | Out-Null
 Expand-Archive -LiteralPath $archive -DestinationPath $target -Force
 Remove-Item -LiteralPath $archive
}
$node=Join-Path $data 'tools/node/node.exe'
if(-not(Test-Path -LiteralPath $node)){
 $unpack=Join-Path $data 'tools/node-extract'
 Get-VerifiedArchive $manifest.node $unpack
 $folder=Get-ChildItem -LiteralPath $unpack -Directory | Select-Object -First 1
 if(-not $folder){throw 'Node archive is invalid.'}
 Move-Item -LiteralPath $folder.FullName -Destination (Join-Path $data 'tools/node')
 Remove-Item -LiteralPath $unpack
}
$env:PATH=(Split-Path $node)+';'+$env:PATH
$npm=Join-Path (Split-Path $node) 'node_modules/npm/bin/npm-cli.js'
$env:npm_config_cache=Join-Path $data 'cache/npm'
$codex=Join-Path $data 'tools/codex'
if(-not(Test-Path -LiteralPath (Join-Path $codex 'node_modules/@openai/codex/package.json'))){
 & $node $npm install --prefix $codex --no-audit --no-fund ('@openai/codex@'+$manifest.codexVersion)
 if($LASTEXITCODE){throw 'Codex component installation failed. Retry from Settings.'}
}
$native=Get-ChildItem -LiteralPath (Join-Path $codex 'node_modules') -Filter codex.exe -Recurse | Select-Object -First 1
if($native){[IO.File]::WriteAllText((Join-Path $data 'codex-executable.txt'),$native.FullName)}
if($Voice){
 $pythonRoot=Join-Path $data 'tools/python';$python=Join-Path $pythonRoot 'python.exe'
 if(-not(Test-Path -LiteralPath $python)){
  Get-VerifiedArchive $manifest.python $pythonRoot
  $pth=Get-ChildItem -LiteralPath $pythonRoot -Filter '*._pth' | Select-Object -First 1
  (Get-Content $pth.FullName) -replace '^#import site$','import site' | Set-Content -LiteralPath $pth.FullName -Encoding ASCII
 }
 $pip=Join-Path $env:TEMP 'get-pip.py'
 if(-not(Test-Path -LiteralPath (Join-Path $pythonRoot 'Lib/site-packages/pip'))){
  Invoke-WebRequest -Uri $manifest.pip.url -OutFile $pip -UseBasicParsing
  if((Get-FileHash -LiteralPath $pip -Algorithm SHA256).Hash -ne $manifest.pip.sha256){Remove-Item -LiteralPath $pip;throw 'Pip verification failed.'}
  & $python $pip --no-warn-script-location
  if($LASTEXITCODE){throw 'Python package installer setup failed.'}
  Remove-Item -LiteralPath $pip
 }
 $env:PIP_CACHE_DIR=Join-Path $data 'cache/pip'
 & $python -m pip install --no-warn-script-location --target (Join-Path $data 'voice/site') -r (Join-Path $PSScriptRoot 'voice/requirements.txt')
 if($LASTEXITCODE){throw 'Voice components could not be installed.'}
 & $python (Join-Path $PSScriptRoot 'voice/engine.py') --setup
 if($LASTEXITCODE){throw 'Voice model download failed. Retry from Settings.'}
}
Write-Output 'Karbs components are ready. Sign in to Codex or add your Gemini API key in Settings.'
