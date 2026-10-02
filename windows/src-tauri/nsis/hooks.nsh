!macro NSIS_HOOK_POSTINSTALL
  IfSilent +2
  MessageBox MB_OK "Meet Karbs, your personal desktop assistant. Connect your own Codex or Gemini account after installation."
  DetailPrint "Installing Karbs desktop components into your user profile..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\runtime\Setup.ps1"'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Component download did not finish. Retry from Karbs Settings."
  ${EndIf}
!macroend
