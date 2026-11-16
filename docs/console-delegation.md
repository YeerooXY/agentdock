# Console delegation field

Each owner console has a **Plan mode** button in its header. It opens a field under the terminal; type a longer task and press Enter to delegate it (Shift+Enter adds a line, Escape closes the field and returns to the button). The field stays closed until opened, so it is not mistaken for the console's own input. While a plan is being made or waits for approval, the button shows a dot.

1. The message goes to the dispatcher (`tasks.planMessage`). By default the console's own account plans it with its lightest discovered model, so a Claude console plans with Haiku and a Codex console with its light model. A dispatcher chosen in Settings > Agents overrides this; if the console account has no eligible model, the Small routing tier plans it. The dispatcher must have local, free or included funding, so planning never uses metered credits.
2. The dispatcher splits the message into tasks and routes each one by size, using the same routing as the Tasks page. Questions are answered in the plan instead of becoming tasks.
3. The field shows "Plan ready: N tasks" with **Approve** and **Review plan**. Nothing runs before approval. Review plan opens the plan on the Tasks page, which shows the request, one row per task (title, size, worker and reviewer) and keeps criteria, files and routing reasons under Details on the console's dark star background.
   With **Start small plans without approval** on (Settings > Agents > Routing, off by default), a plan of one or two small sequential tasks with no design work and no images starts at once and the field shows "Started automatically". Approval still runs its funding and assignment checks; if they fail, the plan waits with the reason. Larger, design and parallel plans always wait.

The default depends only on the console that sends the message, so nothing is tied to one person's setup. Model tiers come from name hints in `electron/routing-models.cjs`: Gemini 4 Hydrogen is a light model and Argon a mid model, alongside Haiku/Flash/Luna and Sonnet/Sol/Terra.
4. After approval the tasks run in order on the console's folder and current branch (`executionMode: 'serial'`), so a dirty working tree is fine and no integration worker is added. Parallel worktree lanes remain available from the Tasks page composer.

The console's own agent is not involved, so delegation costs one dispatcher call plus the workers.

If the dispatcher cannot start, the field shows the reason. For Pi this includes "Pi does not offer the selected model" when routing picked a model Pi no longer lists; choose a dispatcher in Settings > Agents or refresh accounts.

Behaviour kept from the worker composer: the field and its draft survive terminal output and status re-renders; a failed plan keeps the message and shows the dispatcher's error; worker consoles, review panels and closed consoles show no field. Focus stays in the field after planning, Approve is the next Tab stop, and focus returns to the field when the plan is handled.

The field uses the console theme colours (`--frame-a`, `--theme-header`, `--theme-surface`, `--theme-text`).

Code: `src/delegate-composer.js`, `src/delegate-composer.css`; tests: `tests/delegate-composer.test.cjs`.
