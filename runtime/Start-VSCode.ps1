param([string]$Project)
$ErrorActionPreference='Stop'
$command=Get-Command code -ErrorAction SilentlyContinue
if($command){ & $command.Source $Project;exit }
$exe=Join-Path $env:LOCALAPPDATA 'Programs/Microsoft VS Code/Code.exe'
if(-not(Test-Path -LiteralPath $exe)){throw 'Install Visual Studio Code to use Open app.'}
Start-Process -FilePath $exe -ArgumentList ('"'+$Project+'"') -WindowStyle Hidden
