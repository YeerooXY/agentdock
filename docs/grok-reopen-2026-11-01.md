# Grok console reopening

Grok rewrites `~/.grok/config.toml` without Paddock's `BEGIN`/`END` comments. The observed file retained the exact Paddock Node command and bridge script, but used TOML literal strings for Windows paths and a separate `mcp_servers.paddock.env` table. Paddock previously treated the missing comments as a conflicting connection and stopped before opening the console.

The launcher now recognizes the same command and complete argument list in this marker-free representation and leaves the entire file unchanged. Quoted table names, multiline argument arrays and separated environment tables are covered. Different commands or arguments still produce a conflict without editing the file. This is a narrow recognizer, not a general TOML migration: unfamiliar representations, including multiline strings, remain protected.

The installed Grok configuration passed the updated check without modification. A separate comment-only compatibility repair restored the two markers for the currently running Paddock process, with a timestamped backup beside the configuration. Settings values were unchanged. Reopening can be retried now; restarting Paddock loads the permanent fix for subsequent Grok rewrites. An actual restored conversation was not claimed: the regression checks console launch and settings preservation, not Grok conversation resumption.

Regression coverage checks an initial Grok launch, closing, native-style config rewriting, and restoring through `Sessions.restore` with a fake terminal. It also checks repeated recognition, unrelated settings, quoted paths and foreign connection protection. Automated checks make no model requests.

Validation passed: production build; 18 focused CLI setup tests; Windows suite (760 passed, one skipped); Linux suite and headless desktop checks. No visual layout changed.

One bounded Strata request drafted preservation/conflict test cases (354 input, 509 output tokens, 4.076 seconds). Its fixture and asynchronous filesystem usage needed correction, and the draft lacked the actual rewrite fixture; those were supplied during integration. No model retry was made. These counts do not establish net cloud savings.

The live task routing inspection selected local Strata for a small implementation and OpenCode Go Luna for review. Available worker providers remain Codex, Claude, Kiro and OpenCode plus local Strata. The observed Kiro reading had 98.42% remaining and OpenCode's limiting window had 54%; default Claude/Codex weekly allocations were exhausted. Grok, Cursor and Copilot remain interactive consoles rather than automatic task workers. No routing policy was changed by this repair.
