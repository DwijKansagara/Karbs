param([string]$Project)
$ErrorActionPreference='Stop'
$apps=Get-StartApps | Where-Object {$_.AppID -like 'OpenAI.Codex*'} | Select-Object -First 1
if($apps){Start-Process explorer.exe -ArgumentList ('shell:AppsFolder\'+$apps.AppID) -WindowStyle Hidden;exit}
$exe=Join-Path $env:COUCOU_DATA_DIR 'tools/codex/node_modules/@openai/codex/bin/codex.js'
if(-not(Test-Path -LiteralPath $exe)){throw 'Install and sign in to Codex before opening a session.'}
& (Join-Path $env:COUCOU_DATA_DIR 'tools/node/node.exe') $exe
