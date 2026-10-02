$ErrorActionPreference='Stop'
$exe=Join-Path $env:LOCALAPPDATA 'Google/Gemini/Gemini.exe'
if(Test-Path -LiteralPath $exe){Start-Process -FilePath $exe -WindowStyle Hidden}else{Start-Process 'https://gemini.google.com'}
