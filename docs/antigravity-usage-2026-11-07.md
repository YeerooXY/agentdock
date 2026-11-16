# Antigravity usage and removed accounts

The existing display reader rejected empty `[]` progress bars, recognised only
headings ending in `MODELS`, and omitted Gemini 4 Argon's separate weekly pool.
The revised fallback handles the current group and window labels, keeps Argon
separate, and preserves explicit unknown/loading/disabled states. It waits for
the completed panel so an early frame cannot publish only the older pools while
Argon's block is still arriving. It does not infer a five-hour Argon limit.

This remains display-derived data. Installed `agy --help` and `agy help models`
expose no structured quota export; the output-format option applies to print
mode, not a native quota command. A no-model ACP initialization exposed no quota
capability, and creating a temporary ACP session returned an internal error.
No credential extraction or invented private HTTP endpoint was adopted.
Google's [usage documentation](https://antigravity.google/docs/cli/commands/usage)
describes refreshing backend quota through the interactive `/usage` panel.
This investigation does not establish that no private structured endpoint exists.

One hidden native `/usage` probe returned five windows, including separate Argon
weekly quota, without a model request. A later attempt reported a sign-in gate;
it was not treated as zero or fresh quota. Prior saved readings retain their
observation times. The new reader needs the updated main process to be loaded.
Evidence is under `.build/antigravity-usage-20261107/`.

Claude2 was removed through Paddock's existing account-removal dialog. Its profile
no longer exists; StudentAnti remains. The extra Codex profile was already gone.
Old usage data recreated its card independently in the backend and renderer.
Both fallback paths now preserve default accounts while refusing to recreate
unknown named profiles. The renderer also ignores obsolete shown/hidden overrides
for deleted profiles. Historical readings remain data rather than active accounts.
Checks cover those three sources of accidental resurrection. Updated code loads
on the next normal application launch; no restart was scheduled in this work.

The bounded free investigation hit its response limit without a report. The
Antigravity implementation task hit its time bound; useful parser/test edits
were retained and integrated after it stopped. Native failed/unknown usage stays
recorded. No model fallback, paid API request or savings claim was made.
