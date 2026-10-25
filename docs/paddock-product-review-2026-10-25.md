# Paddock product review — 25 October 2026

Findings from a full session examining Paddock's code, docs, screenshots, and competitor landscape.
Not a legal or accessibility certification. Written as a working reference for product decisions.

---

## What Paddock is

A local Windows desktop app that acts as a shared control layer between your AI agent CLIs and your tools, results, and credentials. It runs as an MCP server that any MCP-capable client can connect to. The Paddock desktop app (Electron) is the bridge — it holds credentials, manages the results gallery, runs the website review system, and provides the Meshy 3D pipeline. The MCP server itself is ~1.7 KB and does nothing except forward tool calls to that local bridge.

---

## Security

- Credentials encrypted at rest with OS-backed safeStorage (Windows DPAPI).
- Resolved in the main process only. Never passed to the renderer, never in logs, never in command-line arguments.
- MCP server and usage-helper environments have inherited API tokens stripped before launch.
- The Kimi local usage server binds only 127.0.0.1, keeps its bearer token in memory only, and is never persisted or logged.
- No plaintext fallback, no vault keys in agent-console environments.
- Keys you enter in Settings → Tools reach only the tool process they are bound to.
- The MCP server code is short and fully auditable — it POSTs tool calls to a local bridge URL and returns the response. Nothing else.

**Verdict:** The security architecture is genuinely well-designed, not boilerplate. Your keys do not leak to the agent, to logs, or to any third party.

---

## Supported agents

First-class (MCP + shared instructions + one-click install):
Codex, Claude Code, Google Antigravity, GitHub Copilot, OpenCode, Cursor, Grok Build, Kiro, Qwen Code, Kimi Code, Cline, Factory Droid, Pi, Gemini CLI

Manual wiring via custom command (no checkbox installer):
Aider, Goose, Mistral Vibe

Not supported:
Any client that does not speak MCP.

Direct API use is also a first-class path — Paddock has its own API mode with a project selector, giving the same Results gallery, credential vault, and project context as any CLI session.

---

## What it adds over Kiro CLI alone

| Feature | Kiro CLI | Paddock adds |
|---|---|---|
| Results gallery | None | Persistent, cross-session, cross-client |
| Credentials | Per-client config | One vault, all clients |
| Meshy 3D pipeline | None | Full: text/image→3D, texture, rig, animate, print prep |
| Website review | None | 70-point checklist (accessibility, security, legal) with saved evidence |
| Mobile access | None | Android app, live terminal, model/effort switching, image upload |
| Linux VMs | None | SSH host management, phone access via PC |
| Project planning | None | Brief, research, roadmap, milestone tracking |
| Notifications | None | Push alerts when agent finishes or needs attention |
| Usage tracking | None | Automatic quota reading for Codex, Claude, Copilot, Kiro, Kimi |

---

## Multi-subscription value

- Paddock sits between clients and tools. It doesn't care which client calls it — Kiro, Claude, Copilot, direct API all share the same Results gallery, credentials, and project context.
- Credentials configured once, not per-client.
- Results saved from a Claude session are visible in a Kiro session.
- Usage tracking works automatically for Codex, Claude, Copilot, Kiro, and Kimi. For Antigravity, Gemini CLI, Cursor, Grok, and Factory Droid, the card names their dashboard but no background reader exists yet. OpenCode, Qwen Code, Cline, and Pi show explicitly unavailable quota.
- Subscription limits are account-wide. Paddock never aggregates percentages across sessions or infers limits from token counts. Unknown and stale values stay visible.
- Session continuity (saved chat ID, conversation resume) is Codex and Claude only. All other clients open a fresh session on reopen.

---

## Strengths

**Security architecture** — deliberately designed, not an afterthought. Auditable MCP server, OS-backed credential storage, stripped environments.

**Multi-device** — multiple PCs, multiple paired phones, certificate fingerprint identity, offline name sync, no command replay after reconnect. Production-grade.

**Mobile** — live terminal streaming, model/effort switching mid-session, permission prompt answering, image uploads, reconnect handling. Not a companion app afterthought.

**Linux VM support** — SSH host management with fingerprint verification, phone access flows through the PC.

**Theme system** — 10+ animated themes (Paddock, Hot Pink, Blue, Violet, Void, Redline, Cyber, Icy, Inferno, RGB, Gamer) with per-console accent borders that visually identify the agent running in each slot. Nothing in the competitor space matches this.

**Console grid** — resizable rectangular panels, drag-to-move, process preserved across resize, up to 9 consoles simultaneously. Per-agent colored borders make multi-agent state readable at a glance.

**Results tied to git revisions** — every saved result records branch + commit at turn start and end. Handles detached HEAD, unborn branches, missing history honestly. Never backfills old results with today's HEAD.

**Website review system** — 70-point structured checklist (privacy, security, accessibility, legal) with saved evidence per page. Built into the app, not a separate tool.

**Usage honesty** — gaps are visible, not hidden. Stale readings stay marked. No invented percentages.

**Direct internet pairing without VPN** — UPnP, Duck DNS, optional Windows Firewall rule scoping. No Tailscale required when the router cooperates.

---

## Weaknesses

**Windows-only desktop host.** No macOS or Linux. Real ceiling on audience and credibility.

**Usage tracking incomplete for most CLIs.** Only five providers have background readers. The rest show dashboards or unavailable state.

**Session continuity is Codex/Claude only.** Every other client starts fresh on reopen.

**No relay service yet.** Direct internet works if your router cooperates. Carrier-grade NAT or corporate networks still need Tailscale. The relay is a documented proposal, not shipped.

**Non-console screens lag behind the console grid visually.** Results, Usage, and Settings feel functional but not as polished as the console grid. The website review screen in particular has no visual character.

**Project planning is desktop-only.** Roadmap editor doesn't work from Android.

**macOS/iOS coverage is emulated, not physical.** Every review doc notes this. Font rendering, touch, VoiceOver are unchecked on real Apple hardware.

**No code diff view or file browser.** Paseo and Happier both have these. The data exists (git revisions per turn) but there is no renderer yet.

**Error states are CLI-native.** Raw terminal errors and permission prompts are still very developer-facing. Non-technical users bounce off these.

---

## Competitor comparison

### Paseo
An agentic IDE — editor, file browser, diffs, Git, PRs, browser panel, all in one window. Full plugin and theme marketplace (60+ community palettes). Runs on macOS, Linux, and Windows. More powerful and more complex. Looks like VS Code grew a mobile client. Beats Paddock on functional depth and cross-platform reach. Paddock beats it on visual identity, security architecture, and focused design.

### Happier
Mobile-first, chat-native. Voice assistant, message queuing, swipe navigation, end-to-end encrypted, self-hostable, cross-platform. More approachable for non-developers but loses the multi-console spatial view. Open source.

### Agent Dock (Paddock's own previous version)
Green-on-dark corporate dashboard. Objectively weaker than current Paddock. The personality shift to the current space/starfield design is a meaningful improvement.

**Visual verdict:** Paddock has the most distinctive visual identity in this category. The theme system, animated console backgrounds, and per-agent colored borders have no equivalent in Paseo or Happier. Paseo beats Paddock on overall functional depth. Happier beats Paddock on cross-platform and approachability.

---

## Can Paddock reach Paseo's maturity?

On the control-layer side (mobile, multi-device, session management, usage tracking, cross-agent results) — yes, credibly, within 12–18 months at the current pace.

As a full IDE replacement — that requires building an editor, file browser, diff review, Git integration, and PR creation. That's a strategic decision, not just a roadmap item.

The smarter path is probably not to chase Paseo's IDE scope, but to go deeper on what makes Paddock unique: the theme system, the review tools, the 3D pipeline, the cross-agent results gallery, and the non-developer audience. Paseo is built for developers. Paddock has a real opportunity with non-coders, designers, and founders who run agents but don't live in a terminal.

---

## Recommended next feature: turn-driven code panel

### What it is
A new panel type in the existing console grid. Instead of a terminal process, it shows the files changed in the most recent agent turn, rendered as a syntax-highlighted read-only diff. Clicking a file shows its full contents. Selecting lines sends them as context to a chosen agent console.

### Why this direction

- The data already exists: Results captures git start/end commit per turn.
- The grid already supports arbitrary rectangular panels with drag-resize and process preservation.
- Read-only means no file conflict with a simultaneously running agent — the hardest problem in editor design simply doesn't apply.
- Turn-driven default (show what the agent just touched) means no navigation needed — useful for non-developers who don't know the file tree.
- Monaco's built-in diff viewer handles the rendering. `readOnly: true` is one flag.
- Doesn't lock into anything. If editing is added later, it's purely additive. Nothing about read-only blocks that path.

### Why not a full editor yet
- File conflict with a running agent is a hard, unsolved problem requiring file watching, conflict detection, and resolution UI.
- Save semantics, undo history, and mobile editing add significant scope.
- Editing signals "IDE" to users. Read-only signals "control layer." The latter is Paddock's defensible position.

### Non-developer appeal
Turn-driven read-only view with plain-language diff context is readable by anyone. A designer or founder running an agent to build their site can understand "these 3 files changed this turn" without knowing what a branch is. This is a real market gap — Paseo and Happier are both built for developers.

### Suggested v1 scope
1. Turn finishes → code panel shows changed files from that turn's diff
2. Click a file → full file in read-only syntax-highlighted view
3. Select lines → send to agent console as context
4. Manual file browse as a secondary affordance
5. Ctrl+click file paths in any terminal output → opens that file in the code panel at that line (xterm.js `registerLinkProvider`, low implementation cost, high non-developer value)

---

---

## Additional improvements — sourced from internal research

These come from the simulated user review, the planning personas study, and the 24 October Codex prompt backlog. All are hypotheses until validated with real users.

### Onboarding and first use

**SU-01 — Make the first useful conversation explicit.**
Fresh setup ends at nine empty panels with "Make yourself at home." A new user doesn't know why they need an installed agent, which account to use, or what happens next. Recommendation: state the purpose plainly, show the installed/available state of the selected agent, and offer an explicit "Open first console" action. Proposed heading: "Set up Paddock. Open agent consoles in your project folders and check them from your phone."

**SU-02 — Give existing folders a quick path.**
New project currently leads straight into a four-stage planning flow (brief, research, infrastructure, roadmap). Someone with a working repository just wants to open a console. Recommendation: offer "Open existing folder" and "Plan a new project" as separate paths. Keep planning for people who choose it; don't force it on people who don't.

**SU-03 — Make the mobile reply action visible.**
The collapsed console's chat entry is a 40px tap region with a gradient handle and an accessibility label but no visible text. A new user can find Terminal keys but miss how to send a message. Recommendation: label the entry "Message" or "Reply" visibly.

**SU-04 — Give every finished prompt a useful destination.**
A completion alert with no saved artifact opens Results with "No results were saved for this prompt." The answer isn't there. Recommendation: provide a readable completion outcome or a pinned route to that prompt's answer, even for text-only turns.

**SU-05 — Separate provider account usage from API spending.**
Usage leads with API requests/tokens/cost. Someone signed in through a CLI may confuse the empty API ledger with their subscription usage. Recommendation: separate these visibly. Show an explicit "Key needed" or "Not configured" state for API templates based on actual readiness.

**SU-06 — Fix the drag handle ARIA violation.**
The shared `.window-drag-handle` has `aria-label` on a generic `div` without a role that permits naming. Axe reports `aria-prohibited-attr`, severity serious, across all pages. One-line fix, should not be deferred.

---

### Non-developer and beginner audience

The planning personas study identified six user types. Four of them are non-developers or near-beginners:

- **Mia (first-time vibe coder):** needs plain questions one at a time, somewhere to drop files and photos, a short step list. Will not fill an infrastructure form. Words like "stack" or "tradeoff" stop her.
- **Arjun (student):** needs a rubric turned into milestones, a visible deadline, no sections he can't answer blocking him.
- **Sofia (freelancer):** needs a plan she can share with a client, a clear scope boundary, later features separated so scope creep is visible.
- **Lena (hobby game dev):** needs visual references next to the plan, milestones with screenshot proof, not text-only planning.

**What this means for the product:** The planning flow already has independent sections and a "Not needed" option. The gap is that non-developers never reach it confidently — onboarding filters them out first (SU-01 and SU-02 above). Fix onboarding, and the planning system is already more non-developer-friendly than most competitors. Error states and raw terminal permission prompts remain the next barrier after that.

---

### Upcoming features already in the backlog

These are from the 24 October Codex prompt list — planned but not yet shipped:

**Themed backgrounds on all pages** (Prompt 3)
The star sky and texture backdrop currently only appear behind the console grid. Extending it to the sidebar, Projects, Results, Usage, and API pages would make the non-console screens feel as polished as the console grid. This directly addresses the weakness identified earlier where Results and Usage feel like they belong to a different, less distinctive app.

**More cinematic per-theme effects** (Prompt 4)
Each theme gets state-tied animations: Inferno gets heat-haze and lava glow on Thinking, Blue gets a lightning arc on Ready, Hot Pink gets heart bursts, Redline gets a skin-inspect sweep at launch, Cyber gets a scanline glitch when output starts. These are tied to actual session states (Thinking, Ready, error) not just decoration. Switchable via Console animations setting, reduced-motion safe.

**One-click subscription account switching** (Prompt 5)
Per-console account switcher for Codex first, then Claude. Named profiles with separate config directories. Switch keeps the conversation alive via session resume. Threshold-based prompt (default 90% used) offers the switch without forcing it. Android gets the same action. Directly addresses the multi-subscription use case discussed in this session.

---

### Ctrl+click links in terminal output

Not yet in the backlog but a natural extension of the code panel concept. xterm.js supports `registerLinkProvider` for custom link detection. Register file path patterns (e.g. `src/components/Button.tsx:47`) and URLs. Ctrl+hover shows underline, Ctrl+click fires an IPC message to open the code panel at that file and line, or open the browser for URLs.

Why it matters for non-developers: when an agent says "I updated `src/pages/index.astro`", a non-coder currently has to know what that means and go find it. Ctrl+click makes it a one-action operation. No file tree navigation, no switching apps, no needing to know where anything lives.

Implementation cost is low — the hard work is in xterm.js's existing link provider API.

---

## Additional pain points

These are concrete issues found in the docs, not speculation.

### Account profile deletion is missing
The account switching flow lets you add and rename accounts but has no Remove action. `AccountProfiles` persists account directories and profile metadata with no user-triggered deletion path. Flagged as a known gap in the account-switching review. Any user who creates a test account or makes a mistake adding one has no way to clean it up without going into the filesystem manually.

### Dependency activation is stuck
The dependency security review produced a clean zero-vulnerability audit and a tested Electron 44.9.3 upgrade — but the running app is still on the old lockfile and Electron 44.7.2. The reviewed replacement requires stopping the running app and installing, which hasn't happened. This means the security work is done but not live. A user on the published build is running the older, unreviewed dependency set.

### Keep-awake doesn't cover plain shells
The "keep PC awake while agents work" setting works by tracking Paddock's agent status. Plain shells and custom commands without status reporting are never classified as working — the PC can sleep mid-task. A developer running a long build or test suite in a plain PowerShell console gets no sleep protection. The detection follows Paddock's status model, not whether the terminal process is actually running.

### Connection recovery requires user action after IP change
If the home PC's public IP changes (common with most ISPs), the saved Android address goes stale. Recovery requires either manually entering the new address on Android or running Phone setup → Check my network → Use current public IP → Save on the PC. An offline phone can't discover the new address without a stable hostname (Duck DNS) which requires separate setup. There's no automatic recovery path for the most common home network scenario.

### Notification routing only works for saved results
Clicking a completion notification opens the exact saved result from that turn. But text-only turns — where the agent just replied without saving a file — show "No results were saved for this prompt." The answer isn't retrievable from the notification. For non-developers in particular, most of what they care about is the agent's text response, not a saved file. This is a meaningful gap in the notification→answer flow.

### Same-folder concurrent work has unattributed diffs
When multiple consoles run in the same project folder simultaneously, the turn diff compares file states at turn start/end — but it can't attribute individual changes to specific consoles. The review docs explicitly flag this: "same-folder concurrent work can still overlap. The diff labels this limitation; it is a folder comparison, not proof of individual authorship." A power user running several agents in parallel on the same repo gets ambiguous diffs.

### No profile removal on mobile
The Android app can rename the phone, switch PCs, and forget individual computers — but account profiles (the CLI subscription accounts) are a desktop-only feature. On mobile you can see the accounts and trigger a switch, but you can't add or remove them. This creates an asymmetry: phone users can act on account switching but can't manage the accounts driving it.

### Touch keyboard conflict on Android is partially solved
The fix for Android touch triggering keyboard focus (preview 5) only covered the terminal. Rapid hardware keyboard injection via `adb shell input text` still duplicated characters in xterm during testing. The review notes this explicitly as a separate unresolved issue. Physical keyboard users on Android may see duplicate characters.

### MiroFish requires Zep Cloud
MiroFish (the optional scenario simulation tool) depends on the official backend's Zep Cloud requirement. A real local-LLM simulation and compatibility with community forks are unverified. Users who want to run MiroFish entirely locally are blocked by this external dependency.

### The chunk size advisory is persistent
Every build log across the entire doc set mentions the same Vite JavaScript chunk-size advisory (around 620 kB). It's never addressed. This isn't a correctness issue but it signals the frontend bundle is growing unchecked, which affects load time and memory — relevant if the app is running 9 consoles simultaneously on the same machine as heavy agent workloads.

### WSL Claude switching is unsupported
The account switching feature explicitly notes WSL Claude switching is unavailable until its draft bridge is verified. Users running Claude Code inside WSL (a common setup on Windows) can't use account switching at all. This is a significant gap given that WSL Claude is one of the documented supported installation paths.

---

## Use cases Paddock doesn't support — but users need

These come from competitor feature sets, public developer complaints, and the agentmaxxing/vibe coder workflow research above. Grouped by how hard they are to add.

---

### Git worktree isolation — the biggest gap for parallel agent users

This is table stakes in 2026. Paseo, Happier, Superset, Orca, T3 Code all have it. The core problem: when you run multiple consoles in the same repo simultaneously, agents overwrite each other's files, launch conflicting refactors, and produce ambiguous diffs. Paddock already flags this in the Results attribution docs ("same-folder concurrent work can still overlap").

Git worktrees solve this by giving each agent its own working directory and branch, all pointing to the same `.git`. No file collisions, no index lock failures, no confusion about who changed what. The agentmaxxing community — running 3–7 agents in parallel — treats this as a hard requirement. Without it, Paddock's multi-console grid is visually impressive but operationally fragile for anyone doing serious parallel work.

What it would take: when launching a console, offer a "New worktree" option that runs `git worktree add` into a generated directory and starts the agent there. The console's folder binding would point to the worktree path. When the console ends or the user chooses to merge, show the branch/diff for review. The code panel concept (turn-driven diff) pairs naturally with this — the diff is already per-console, per-turn, and the worktree gives it clean attribution.

This is the single feature most likely to unlock the power-user agentmaxxing audience.

---

### Voice input — nobody has done it well yet

Happier has a voice assistant that watches every running session. Paseo has on-device voice. But both treat it as a dictation layer — you talk, it types. Nobody has built voice that understands *which console* to target or can approve a permission prompt hands-free across multiple sessions.

For vibe coders specifically, voice is high value: you're watching output, your hands are elsewhere, you want to say "approve that" or "tell console 2 to stop and fix the tests." That's not dictation — it's intent-aware routing across multiple running agents.

It's hard to build well. The easy version (microphone → text → send to selected console) is a week of work. The useful version (intent parsing, multi-console routing, permission approval by voice) is significantly more. But even the easy version has no equivalent in Paddock today, and Happier's implementation is mobile-only. A desktop voice shortcut alone would be differentiated.

---

### Message queue / pre-loaded prompts

Happier lets you queue messages while an agent works — reorder, edit, or send them immediately. None of the others have this. The use case: you're reviewing output while the agent is still running, you spot three things to address, you queue them up in order rather than waiting for the agent to finish and then typing them one by one.

For non-developers this is especially useful — they tend to think of instructions in batches ("do this, then that, then check this") rather than one at a time. A simple ordered queue per console, editable while the agent is running, is the feature. No AI needed, just a list UI above the message input.

---

### Web preview panel

Paseo has an integrated browser panel. When you're building a website with an agent, you currently have to alt-tab to a browser, refresh, look, alt-tab back. A web preview panel in the console grid — just a webview pointed at localhost — would close that loop. For vibe coders building sites (Mia persona, Sofia persona), this is the missing piece between "agent finished" and "I can see what it built."

The implementation is straightforward in Electron — a `<webview>` tag or a BrowserWindow pointed at a configurable localhost URL. The power is in the integration: when an agent turn finishes, auto-refresh the preview. Combined with the code panel and the diff view, you get a complete review loop without leaving Paddock.

---

### Scheduled / recurring agent runs

No app in this space has this. The use case: run an agent on a schedule — every morning, check the repo for failing tests and fix them. Or every hour, check the staging site and run the 70-point website review. Or trigger an agent run when a GitHub webhook fires.

For non-developers especially, this is powerful — "have the agent update my site every Friday with new content" is a real workflow. For developers, it's a CI-adjacent automation layer that doesn't require a full CI setup.

The hard part is safety: an unattended scheduled agent can do a lot of damage. It needs conservative defaults (read-only unless explicitly enabled, dry-run first, hard spending cap, immediate pause on any error). But the scheduling mechanism itself — cron expression, target console config, notification on completion — is not complex.

---

### Prompt library / reusable instructions

Every vibe coder and developer builds up a mental library of prompts that work: "always write tests first," "use this project's code style," "when you see X pattern do Y." Right now those live in steering files, CLAUDE.md files, or the user's head. There's no UI for managing, versioning, or reusing them across projects.

A simple prompt library — named prompts, tagged by project or agent, insertable from the message input — would be used constantly. Paseo doesn't have it. Happier doesn't have it. It's a gap across the whole category.

The non-developer angle: non-coders tend to forget what wording worked last time. A library of "things that work for this project" that they can tap from mobile is directly useful.

---

### API cost visibility before a run

The biggest pain point in the vibe coder complaints: surprise API bills. OpenClaw users were hitting $300–500/month without understanding why. The core issue is there's no "this task will cost approximately X" before you send a prompt.

Paddock already has the API ledger and per-turn cost estimates. The missing piece is a *pre-flight* estimate: based on context size, the selected model, and the configured rate, show an estimated cost range before the user hits send. Even a rough "~$0.04 - $0.12" label would let users make informed decisions about which model to use for a given task.

This is valuable for power users managing costs across multiple subscriptions. It's critical for non-developers who have no intuition for token costs and no warning system when something goes expensive.

---

### What even the best competitors miss

These are gaps across Paseo, Happier, and Paddock — nobody has solved them well:

- **Cross-agent task decomposition UI.** The "agentmaxxing" workflow requires you to manually decompose work into parallel tasks. Every tool assumes you've already done this. Nobody has a UI that helps you break a goal into parallel agent tasks with explicit dependency rules and conflict zones marked. The closest is Paseo's worktree + PR model, but that's post-hoc review, not pre-flight decomposition.

- **Agent output confidence / verification.** Agents say "done" when they may not be. No tool shows "the agent claimed completion, here's what was actually verified vs. unverified." Paddock's 70-point checklist is the closest thing in any app to structured verification, but it's website-specific and manual.

- **Cost attribution by task/milestone.** You can see total spending but not "this milestone cost $4.20, that refactor cost $18." Nobody tracks cost at the task level. For freelancers (Sofia persona) who want to know what an agent job actually costs, this would be directly useful.

- **Graceful context window management.** The OpenClaw complaints about context compaction summarizing away instructions are universal. Every agent hits the context window eventually and handles it differently. No control layer gives the user visibility into context usage per console or lets them decide what gets preserved vs. summarized before it happens.

---

## Open questions / things to validate

- Whether non-developer users actually try Paddock in practice, or whether the terminal-centric onboarding filters them out before they see the value
- Whether the relay service is worth building vs. pointing users to Tailscale
- Whether usage tracking gaps (most CLIs) matter enough to current users to prioritize
- Whether macOS host support is a prerequisite for broader adoption or a later concern
- Whether the code panel default (turn-driven) works for non-coders or needs a "what your agent did" narrative layer on top
- Whether the SU-02 "existing folder quick path" is enough to unblock non-developers, or whether the full onboarding needs a guided mode (one question at a time, as proposed for Mia and Arjun personas)
- Whether account switching (Prompt 5) is more valuable than usage tracking improvements for multi-sub users — or whether both are needed together to tell a coherent story
