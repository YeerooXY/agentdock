# Paddock 0.6.0-preview.43

Windows x64 and Android ARM64, ARMv7 and x64. Update the PC and phone together.

- Removed the Results gallery, generic result-saving tools and automatic file-change capture. Website reviews and image previews remain available. Existing files and project data stay on disk.
- Removed mandatory turn-completion and project-progress calls, duplicate startup instructions, guided planning/proposals and generated project-plan mirrors. Basic project editing, folders, consoles and Knowledge remain available.
- Removed reviewer fallback chains, guessed task sizes, magic-string handoffs and the legacy desktop snapshot stream. Standalone reviews use an explicit reviewer account; quota checks retain stale, unknown and shared-account safeguards.
- Fixed Settings saving after removal of the old desktop stream. Keyboard focus is preserved when projects are saved and milestones are changed.

Verification: production build, 1,323 passing Node tests (2 skipped), 443 passing Flutter tests, clean Flutter analysis, packaged archive integrity, hidden packaged startup, APK versions/signing identity and uploaded asset hashes. Browser checks cover Chromium and WebKit at desktop and phone sizes.

Docker desktop tests remain unavailable because the Linux engine is stopped. Physical-phone checks remain pending. Windows is unsigned. Close active work before installing. Android previews retain their existing signing certificate.
