; The bundled runtime normally installs in Tauri's WebView2 section before this
; hook. Do not copy a working-looking app if that section was skipped or an
; obsolete runtime was left behind after a failed runtime update.
!include "WinVer.nsh"

!macro NSIS_HOOK_PREINSTALL
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "PhotoRequest needs Windows 10 or Windows 11 (64-bit). Update Windows on this computer before installing PhotoRequest. Your orders have not been changed." /SD IDOK
    SetErrorLevel 1633
    Abort
  ${EndIf}
  ${If} ${RunningX64}
    ReadRegStr $4 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${Else}
    ReadRegStr $4 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}
  ReadRegStr $R2 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${If} $R2 != ""
    ${If} $4 == ""
      StrCpy $4 $R2
    ${Else}
      ${VersionCompare} "$R2" "$4" $R0
      ${If} $R0 == 1
        StrCpy $4 $R2
      ${EndIf}
    ${EndIf}
  ${EndIf}
  ${If} $4 == ""
    MessageBox MB_OK|MB_ICONSTOP "PhotoRequest could not find Microsoft Edge WebView2 after setup. Restart Windows, then run this installer again. If your computer is managed by work or school, ask the administrator to allow WebView2. Setup has stopped before copying PhotoRequest. Help: https://github.com/ooberguts/photorequest/blob/main/public/INSTALLATION.txt" /SD IDOK
    SetErrorLevel 1603
    Abort
  ${EndIf}
  ${VersionCompare} "${MINIMUMWEBVIEW2VERSION}" "$4" $R0
  ${If} $R0 == 1
    MessageBox MB_OK|MB_ICONSTOP "Microsoft Edge WebView2 is still too old for PhotoRequest. Connect to the internet and run setup again so Microsoft can update it, or install the current Evergreen Standalone WebView2 Runtime from https://developer.microsoft.com/microsoft-edge/webview2. On a managed computer, ask the administrator for help. Your existing orders have not been changed." /SD IDOK
    SetErrorLevel 1603
    Abort
  ${EndIf}
!macroend
