; NSIS Installer Script for Conectados Factura+
; Custom installer behavior

!macro customHeader
  ; Custom header for installer
!macroend

!macro preInit
  ; Actions before initialization
!macroend

!macro customInit
  ; Check if previous version exists and warn about upgrade
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "DisplayVersion"
  ${If} $R0 != ""
    MessageBox MB_OK "Se detectó una versión anterior ($R0) de Conectados Factura+. Se procederá a actualizar."
  ${EndIf}
!macroend

!macro customInstall
  ; Create desktop shortcut for all users
  SetShellVarContext all
  CreateShortcut "$DESKTOP\Conectados Factura+.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
!macroend

!macro customUnInstall
  ; Remove desktop shortcut
  SetShellVarContext all
  Delete "$DESKTOP\Conectados Factura+.lnk"
!macroend
