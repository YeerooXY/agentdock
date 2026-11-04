# Paddock 0.6.0-preview.36

Windows desktop and Android preview. Close active work before installing. The desktop installer preserves the existing profile. Android uses the existing application ID and preview signing configuration. This preview is unsigned on Windows.

- Model and account switching now wait until the temporary draft marker actually appears before deleting it. Background terminal redraws can no longer trigger early cleanup. The shared fix covers the Codex and Claude Code resume adapters.
- Regression checks cover delayed editor return, unrelated background output, styled/wrapped markers and timeout without deletion keys. Exact draft preservation and staged replacement checks remain active.
- The Android build includes the already committed composer send button, combined model/effort controls, terminal font adjustment and Tasks badge.

Install the new Windows desktop version for the model fix. An Android update alone cannot apply this main-process change. Remove a marker left by an earlier failed operation before trying again.

The broader mobile text layout remains under review. This release does not claim to fix inherited indentation, clipped terminal output or accumulating Claude footer rules. See `docs/mobile-output-review-2026-11-04.md` for the shared reading-view proposal and provider-specific checks.

Automated tests use fixtures and make no paid model requests. A real Codex draft capture/restoration check passed, including multiline Unicode and trailing whitespace; a full live model switch on a paired phone remains unverified. No macOS installer or physical-device verification is claimed for this release.
