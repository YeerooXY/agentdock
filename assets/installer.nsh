!macro customUnInit
  ${IfNot} ${Silent}
    IfFileExists "$APPDATA\Agent Dock\managed-downloads.txt" 0 dock_download_notice_done
    MessageBox MB_YESNO|MB_ICONINFORMATION "Tools and repositories downloaded through Agent Dock will stay on this computer.$\r$\n$\r$\nWould you like to review their names and locations for manual cleanup before continuing?$\r$\n$\r$\nThis uninstaller will not delete those downloads or your projects." IDNO dock_download_notice_done
    ExecShell "open" "$APPDATA\Agent Dock\managed-downloads.txt"
    dock_download_notice_done:
  ${EndIf}
!macroend
