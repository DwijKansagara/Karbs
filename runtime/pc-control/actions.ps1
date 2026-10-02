$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CoucouInput {
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window,int cmd);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,IntPtr pid);
 [DllImport("user32.dll",EntryPoint="GetWindowThreadProcessId")] public static extern uint WindowProcess(IntPtr hwnd,out uint pid);
 public delegate bool EnumWindowCallback(IntPtr window,IntPtr param);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowCallback callback,IntPtr param);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
 public static IntPtr WindowForProcess(int processId) {
  IntPtr found=IntPtr.Zero;
  EnumWindows((window,param)=>{uint owner;WindowProcess(window,out owner);if(owner==processId && IsWindowVisible(window)){found=window;return false;}return true;},IntPtr.Zero);
  return found;
 }
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint first,uint second,bool attach);
 public static bool Focus(IntPtr window) {
  ShowWindow(window,9);
  uint current=GetCurrentThreadId(), other=GetWindowThreadProcessId(GetForegroundWindow(),IntPtr.Zero);
  bool attached=current!=other && AttachThreadInput(current,other,true);
  try {SetForegroundWindow(window);return GetForegroundWindow()==window;}
  finally {if(attached) AttachThreadInput(current,other,false);}
 }
 [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLong(IntPtr hwnd,int index);
 [DllImport("user32.dll",EntryPoint="SetWindowLongPtrW")] public static extern IntPtr SetWindowLong(IntPtr hwnd,int index,IntPtr value);
 [StructLayout(LayoutKind.Sequential)] public struct Key {public ushort vk;public ushort scan;public uint flags;public uint time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Explicit,Size=40)] public struct Input {[FieldOffset(0)] public uint type;[FieldOffset(8)] public Key key;}
 [DllImport("user32.dll")] public static extern uint SendInput(uint count,Input[] inputs,int size);
 public static void TypeText(string text) {
  foreach(char c in text) {
   Input down=new Input();down.type=1;down.key.scan=c;down.key.flags=4;
   Input up=down;up.key.flags=6;
   if(SendInput(2,new Input[]{down,up},40)!=2) throw new Exception("Windows blocked typing into this app.");
  }
 }
}
'@
function Get-AppWindow([int]$processId) {
    $process = Get-Process -Id $processId
    $window=$process.MainWindowHandle
    if ($window -eq [IntPtr]::Zero) {$window=[CoucouInput]::WindowForProcess($processId)}
    if ($window -eq [IntPtr]::Zero) { throw 'That process has no accessible window.' }
    return $window
}
function Focus-App([int]$processId) {
    if(-not [CoucouInput]::Focus((Get-AppWindow $processId))){throw 'Windows could not focus the requested app. No typing or clicks were sent.'}
}
function Show-CursorMove([int]$x,[int]$y) {
    Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
    $xml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" Width="108" Height="108" WindowStyle="None" AllowsTransparency="True" Background="Transparent" Topmost="True" ShowActivated="False" ShowInTaskbar="False" IsHitTestVisible="False">
 <Canvas>
  <Ellipse Name="Halo" Canvas.Left="20" Canvas.Top="20" Width="68" Height="68" Stroke="#884FEAFF" StrokeThickness="2" Fill="#224FEAFF"><Ellipse.Effect><DropShadowEffect Color="#975BFF" BlurRadius="18" ShadowDepth="0"/></Ellipse.Effect></Ellipse>
  <Ellipse Canvas.Left="41" Canvas.Top="41" Width="26" Height="26" Fill="#885C64FF" Stroke="#EEFFFFFF" StrokeThickness="2"/>
  <TextBlock Canvas.Left="26" Canvas.Top="87" Text="KARBS" Foreground="#E8FFFFFF" FontSize="9" FontWeight="Bold"/>
 </Canvas>
</Window>
'@
    $reader = New-Object System.Xml.XmlNodeReader ([xml]$xml)
    $overlay = [Windows.Markup.XamlReader]::Load($reader)
    $overlay.Show()
    $handle = (New-Object Windows.Interop.WindowInteropHelper($overlay)).Handle
    $style = [CoucouInput]::GetWindowLong($handle,-20).ToInt64() -bor 0x08000000 -bor 0x20 -bor 0x80
    [CoucouInput]::SetWindowLong($handle,-20,[IntPtr]$style) | Out-Null
    $start = [Windows.Forms.Cursor]::Position
    for($step=1;$step -le 24;$step++) {
        $t=$step/24.0; $ease=$t*$t*(3-2*$t)
        $cx=[int]($start.X+($x-$start.X)*$ease); $cy=[int]($start.Y+($y-$start.Y)*$ease)
        [CoucouInput]::SetCursorPos($cx,$cy) | Out-Null
        $overlay.Left=$cx-54; $overlay.Top=$cy-54
        $overlay.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Render)
        Start-Sleep -Milliseconds 10
    }
    return $overlay
}
function Get-ControlRoot([int]$processId) {
    Add-Type -Path 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/WPF/UIAutomationClient.dll'
    Add-Type -Path 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/WPF/UIAutomationTypes.dll'
    return [Windows.Automation.AutomationElement]::FromHandle((Get-AppWindow $processId))
}
try {
    if($request.processId -and $request.action -in @('click','type_text','press_keys','scroll','focus_window')) {Focus-App $request.processId}
    $result = switch ($request.action) {
        'focus_window' {@{focused=$request.processId}}
        'list_windows' {
            @{windows=@(Get-Process | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | ForEach-Object { @{processId=$_.Id;app=$_.ProcessName;title=$_.MainWindowTitle} })}
        }
        'inspect_window' {
            $root=Get-ControlRoot $request.processId
            @{controls=@($root.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition) | Select-Object -First 200 | ForEach-Object {
                $rect=$_.Current.BoundingRectangle
                @{type=$_.Current.ControlType.ProgrammaticName;name=$(if($_.Current.IsPassword){'Password field'}else{$_.Current.Name});enabled=$_.Current.IsEnabled;offscreen=$_.Current.IsOffscreen;id=$_.Current.AutomationId;bounds=@{x=$rect.X;y=$rect.Y;width=$rect.Width;height=$rect.Height}}
            })}
        }
        'screenshot' {
            $bounds=[Windows.Forms.SystemInformation]::VirtualScreen
            $bitmap=New-Object Drawing.Bitmap($bounds.Width,$bounds.Height)
            $graphics=[Drawing.Graphics]::FromImage($bitmap)
            $graphics.CopyFromScreen($bounds.Location,[Drawing.Point]::Empty,$bounds.Size)
            $scale=[Math]::Min(1.0,1600.0/$bounds.Width)
            $resized=New-Object Drawing.Bitmap([int]($bounds.Width*$scale),[int]($bounds.Height*$scale))
            $g=[Drawing.Graphics]::FromImage($resized)
            $g.DrawImage($bitmap,0,0,$resized.Width,$resized.Height)
            $stream=New-Object IO.MemoryStream
            $resized.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
            @{image=[Convert]::ToBase64String($stream.ToArray());width=$resized.Width;height=$resized.Height;screenX=$bounds.X;screenY=$bounds.Y;scale=$scale}
            $g.Dispose();$graphics.Dispose();$bitmap.Dispose();$resized.Dispose();$stream.Dispose()
        }
        'open' {
            switch ($request.target.ToLowerInvariant()) {
                'gemini' {& (Join-Path $env:KARBS_ROOT 'Start-Gemini.ps1')}
                'vscode' {& (Join-Path $env:KARBS_ROOT 'Start-VSCode.ps1')}
                'codex' {Start-Process -FilePath 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-File',(Join-Path $env:KARBS_ROOT 'Start-Codex.ps1') -WindowStyle Normal}
                'explorer' {Start-Process -FilePath 'explorer.exe' -ArgumentList $env:USERPROFILE -WindowStyle Normal}
                default {
                    if($request.target -match '^https?://' -or (Test-Path -LiteralPath $request.target)){Start-Process -FilePath $request.target -WindowStyle Normal}
                    else{throw 'Target must be a supported app, existing path or http(s) URL.'}
                }
            }
            @{opened=$request.target}
        }
        'click' {
            $b=[Windows.Forms.SystemInformation]::VirtualScreen
            if($request.x -lt $b.Left -or $request.x -ge $b.Right -or $request.y -lt $b.Top -or $request.y -ge $b.Bottom){throw 'Click is outside the desktop.'}
            [CoucouInput]::SetCursorPos($request.x,$request.y) | Out-Null
                $down=2;$up=4
                switch($request.button){'right'{$down=8;$up=16}'middle'{$down=32;$up=64}''{} 'left'{} $null{} default{throw 'Unsupported mouse button.'}}
                [CoucouInput]::mouse_event($down,0,0,0,[UIntPtr]::Zero);[CoucouInput]::mouse_event($up,0,0,0,[UIntPtr]::Zero)
                if($request.double){Start-Sleep -Milliseconds 80;[CoucouInput]::mouse_event($down,0,0,0,[UIntPtr]::Zero);[CoucouInput]::mouse_event($up,0,0,0,[UIntPtr]::Zero)}
            @{clicked=@{x=$request.x;y=$request.y}}
        }
        'type_text' {[CoucouInput]::TypeText([string]$request.text);@{typedCharacters=$request.text.Length}}
        'scroll' {
            if([Math]::Abs([long]$request.notches) -gt 100){throw 'Scroll is limited to 100 notches.'}
            $wheel=[BitConverter]::ToUInt32([BitConverter]::GetBytes([int]($request.notches*120)),0)
            [CoucouInput]::mouse_event(0x0800,0,0,$wheel,[UIntPtr]::Zero);@{scrolled=$request.notches}
        }
        'press_keys' {
            $tokens=$request.keys.ToUpperInvariant().Split('+');$prefix='';$key=$tokens[-1]
            if($tokens.Length -gt 1){foreach($modifier in $tokens[0..($tokens.Length-2)]){switch($modifier){'CTRL'{$prefix+='^'}'ALT'{$prefix+='%'}'SHIFT'{$prefix+='+'}default{throw 'Unknown key modifier.'}}}}
            $names=@{ENTER='ENTER';TAB='TAB';ESC='ESC';SPACE=' ';BACKSPACE='BACKSPACE';DELETE='DELETE';LEFT='LEFT';RIGHT='RIGHT';UP='UP';DOWN='DOWN';HOME='HOME';END='END';PAGEUP='PGUP';PAGEDOWN='PGDN'}
            if($names.ContainsKey($key)){$send=if($key -eq 'SPACE'){' '}else{'{'+$names[$key]+'}'}}
            elseif($key -match '^[A-Z0-9]$'){$send=$key.ToLowerInvariant()}else{throw 'Unsupported key.'}
            [Windows.Forms.SendKeys]::SendWait($prefix+$send);@{pressed=$request.keys}
        }
        'invoke' {
            $root=Get-ControlRoot $request.processId
            $condition=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::NameProperty,[string]$request.name)
            $control=$root.FindFirst([Windows.Automation.TreeScope]::Descendants,$condition)
            if(-not $control -or -not $control.Current.IsEnabled){throw 'That control was not found or is disabled.'}
            $pattern=$control.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern)
            $pattern.Invoke();@{invoked=$request.name;processId=$request.processId}
        }
        'run_command' {
            $output=& ([scriptblock]::Create([string]$request.command)) 2>&1 | Out-String
            @{output=$output.Substring(0,[Math]::Min(12000,$output.Length))}
        }
        default {throw 'Unknown PC action.'}
    }
    $result | ConvertTo-Json -Depth 8 -Compress
} catch {[Console]::Error.WriteLine($_.Exception.Message);exit 1}
