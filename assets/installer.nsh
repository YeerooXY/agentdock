!macro customUnInit
  ${IfNot} ${Silent}
    ; Installs from before the rename kept the "Agent Dock" data folder.
    StrCpy $0 "$APPDATA\Paddock\managed-downloads.txt"
    IfFileExists $0 dock_download_notice 0
    StrCpy $0 "$APPDATA\Agent Dock\managed-downloads.txt"
    IfFileExists $0 dock_download_notice dock_download_notice_done
    dock_download_notice:
    MessageBox MB_YESNO|MB_ICONINFORMATION "Tools and repositories downloaded through Paddock will stay on this computer.$\r$\n$\r$\nWould you like to review their names and locations for manual cleanup before continuing?$\r$\n$\r$\nThis uninstaller will not delete those downloads or your projects." IDNO dock_download_notice_done
    ExecShell "open" $0
    dock_download_notice_done:
  ${EndIf}
!macroend
