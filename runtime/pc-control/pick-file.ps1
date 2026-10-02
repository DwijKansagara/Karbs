$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
$dialog=New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title='Choose a file for Coucou'
$dialog.InitialDirectory=[Environment]::GetFolderPath('MyDocuments')
try {if($dialog.ShowDialog() -eq [Windows.Forms.DialogResult]::OK){[Console]::Write($dialog.FileName)}}finally{$dialog.Dispose()}
