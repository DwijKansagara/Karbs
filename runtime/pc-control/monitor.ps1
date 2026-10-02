param([int]$ParentId,[switch]$Once)
$ErrorActionPreference='Stop'
$env:TEMP=(Join-Path $env:COUCOU_DATA_DIR 'temp')
$env:TMP=(Join-Path $env:COUCOU_DATA_DIR 'temp')
Add-Type -Path 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/WPF/UIAutomationClient.dll'
Add-Type -Path 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/WPF/UIAutomationTypes.dll'
$lastBusy=$false
$phase='idle'
$serial=0
do {
    $gemini=@(Get-Process Gemini -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$env:LOCALAPPDATA\Google\Gemini\*" })
    $code=@(Get-Process Code -ErrorAction SilentlyContinue)
    $busy=$false;$observable=$false
    foreach($process in $gemini | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero }) {
        try {
            $root=[Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
            $condition=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::Button)
            foreach($button in $root.FindAll([Windows.Automation.TreeScope]::Descendants,$condition)) {
                $label=$button.Current.Name
                if($label -match '^(Send|Send message|Stop response|Stop generating|Stop responding|Stop|New chat|Copy response|Temporary chat)$' -or $label -match '^Dictate'){$observable=$true}
                if(-not $button.Current.IsOffscreen -and $label -match '^Stop($| (response|generating|responding))'){$busy=$true}
            }
        }catch{}
    }
    if($busy -and -not $lastBusy){$phase='working';$serial++}
    elseif(-not $busy -and $lastBusy -and $observable){$phase='finished';$serial++}
    elseif(-not $observable -or -not $gemini.Count){$phase='idle'}
    $lastBusy=$busy
    $status=@{
        gemini=@{installed=(Test-Path -LiteralPath "$env:LOCALAPPDATA/Google/Gemini/Gemini.exe");running=($gemini.Count -gt 0);observable=$observable;phase=$phase;serial=$serial}
        vscode=@{installed=(Test-Path -LiteralPath "$env:LOCALAPPDATA/Programs/Microsoft VS Code/Code.exe");running=($code.Count -gt 0);codexExtension=(Test-Path -LiteralPath "$env:USERPROFILE/.vscode/extensions/extensions.json")}
    }
    $json=$status | ConvertTo-Json -Depth 5 -Compress
    $temporary=(Join-Path $env:COUCOU_DATA_DIR 'desktop-status.tmp')
    $destination=(Join-Path $env:COUCOU_DATA_DIR 'desktop-status.json')
    [IO.File]::WriteAllText($temporary,$json,(New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temporary -Destination $destination -Force
    if($Once){break}
    Start-Sleep -Milliseconds 800
}while((Get-Process -Id $ParentId -ErrorAction SilentlyContinue).ProcessName -eq 'karbs')
