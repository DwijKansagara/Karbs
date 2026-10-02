param([ValidateSet('codex','gemini','vscode')][string]$AppName,[string]$Project='')
$ErrorActionPreference='Stop'
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class AgentFocus {
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd,int command);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,IntPtr pid);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a,uint b,bool attach);
 public static bool Open(IntPtr hwnd) {
  ShowWindow(hwnd,9);ShowWindow(hwnd,3);
  uint a=GetCurrentThreadId(),b=GetWindowThreadProcessId(GetForegroundWindow(),IntPtr.Zero),c=GetWindowThreadProcessId(hwnd,IntPtr.Zero);
  bool linked=a!=b&&AttachThreadInput(a,b,true),target=a!=c&&b!=c&&AttachThreadInput(a,c,true);
  try{BringWindowToTop(hwnd);SetForegroundWindow(hwnd);return GetForegroundWindow()==hwnd;}finally{if(target)AttachThreadInput(a,c,false);if(linked)AttachThreadInput(a,b,false);}
 }
}
'@
function Find-Agent {
 $windows=@(Get-Process | Where-Object {$_.MainWindowHandle -ne [IntPtr]::Zero})
 $candidates=@($windows | Where-Object {
  $candidate=$_
  switch($AppName){
   'codex' {($candidate.ProcessName -eq 'ChatGPT' -and $candidate.Path -like '*OpenAI.Codex_*') -or $candidate.ProcessName -eq 'Codex'}
   'gemini' {$candidate.ProcessName -eq 'Gemini'}
   'vscode' {$candidate.ProcessName -eq 'Code'}
  }
 })
 if($Project){$leaf=Split-Path -Leaf $Project;$preferred=$candidates | Where-Object {$_.MainWindowTitle -like "*$leaf*"} | Select-Object -First 1;if($preferred){return $preferred}}
 return $candidates | Select-Object -First 1
}
$window=Find-Agent
if(-not $window){
 switch($AppName){
  'codex' {
   $entry=Get-StartApps | Where-Object {$_.AppID -like 'OpenAI.Codex*'} | Select-Object -First 1
   if($entry){Start-Process -FilePath explorer.exe -ArgumentList ('shell:AppsFolder\'+$entry.AppID) -WindowStyle Hidden}
   else{throw 'Codex desktop app was not found. Use Start Codex and Coucou.cmd for a terminal session.'}
  }
  'gemini' {& (Join-Path $PSScriptRoot 'Start-Gemini.ps1')}
  'vscode' {& (Join-Path $PSScriptRoot 'Start-VSCode.ps1')}
 }
 for($i=0;$i -lt 30 -and -not $window;$i++){Start-Sleep -Milliseconds 250;$window=Find-Agent}
}
if(-not $window){throw 'The selected app did not expose a window.'}
$focused=$false
for($attempt=0;$attempt -lt 8 -and -not $focused;$attempt++){$focused=[AgentFocus]::Open($window.MainWindowHandle);if(-not $focused){Start-Sleep -Milliseconds 250}}
if(-not $focused){throw 'Windows did not bring the selected app forward. Its window was restored.'}
@{app=$AppName;processId=$window.Id;opened=$true} | ConvertTo-Json -Compress
