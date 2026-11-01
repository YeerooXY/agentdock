# Agent context and completion

31 October 2026. Context and completion rules for tracked work and conversational study.

## Context

`dock_context({includeProject:true})` starts or returns the current turn and supplies shared instructions, the explicit chat/project binding and linked-project details in one call. It omits accumulated notes, the full tool catalogue and detailed optional policies. User-written shared instructions are preserved. Calling without options remains supported.

Use `includeProject:true` for approved decisions, scope, milestones, references and planning revision in the task-start call. The separate `dock_context({detail:"project"})` read remains supported. Draft sections remain draft. Use `dock/project_plan` when section data or proposals are needed. `dock_context({detail:"shared"})` provides setup, creative-tool, preview and installed-skill policies. Read it before using those workflows. `dock_context({detail:"history",cursor:0})` pages through previous notes and recorded outcomes; pass its `nextCursor` to continue. Detail calls do not start another turn.

Discover one schema with `dock_tools({tool:"dock/finish_turn"})`, then invoke it through `dock_call`. Broad catalogue discovery remains available when needed.

Each task-context response starts with a JSON header containing `contextRevision: {instructions, project}`, `unchanged`, `projectUnchanged` and the current project binding. On later tasks, pass the complete revision object from your own previous response as `sinceContextRevision`, with `includeProject:true`. Keep the corresponding instructions and project details in the conversation. Omit the receipt after losing that context or when a different caller has not read it.

Instruction and project revisions are separate: progress or scope changes resend project data without repeating all shared rules. A changed instruction revision resends instructions and project details and invalidates cached shared-detail reads. The instruction hash covers the launch, chat, folder, provider, profile, binding, shared policies and course instructions. No server-side last-reader cache is used. Invalid receipt shapes fail before tracking starts; stale receipts return current sections.

Every normal call still obtains the current turn ID and capture state. Live study timer and reflection data is read afresh outside the revision hashes. `includeProject:true` satisfies the existing project-context read requirement for that turn, including when the caller acknowledges the current project section. It grants no approvals and changes no output, task or completion checks. Ordinary tutoring needs no normal context call only in consoles whose study instructions explicitly enable quiet mode. Other consoles retain normal task-start and completion requirements.

Reusing a receipt reduces response size. Combining project details with task start removes one context call from the usual linked-project workflow. Neither mechanism removes calls needed to perform the user's work. Reuse tool schemas already known in the conversation; rediscover them when a needed schema is missing or has changed.


## Conversational study

`dock_context({detail:"study"})` reads the selected course's Playtime reflections and timer without starting or finishing a work turn, looking up Git, touching project activity or writing a completion record. It works in unlinked course chats. It returns `courseId`, the current `projectId`, `readAt`, `reflections` and `timer`; unrelated folders and excluded sessions return `status:"inactive"`.

Refresh on entry or resume, after a break or a saved reflection changes, and before making claims that depend on the timer or current saved history. Reuse source material and instructions between ordinary answers. Startup context already supplies the course and rules; rewriting a live instruction file does not inject that content into an existing model conversation.

Pass the `reflections.revision` from your own previous response as `sinceReflectionRevision`. When available reflections match, the response includes `status`, `revision` and `unchanged:true` without repeating the notes. A different revision returns the full current course-scoped recent list, including an empty list after deletion. An unavailable store is always explicitly unavailable. Revisions include course and profile identity and normalized reflection data; each caller supplies its own revision, so agents sharing a console cannot consume each other's changes. The timer is reread on every requested refresh and retains its existing freshness, pause and course-isolation checks.

Unlinked local Codex and Claude consoles in a registered course folder can continue ordinary study responses quietly. Their native callbacks use `dock/agent_response`; a conversation with no tracked work returns `completion:"study-continuation"` and becomes `open`, without ready or attention alerts. This path creates no completion record. Startup and refreshed study instructions state which lifecycle applies to the actual provider and project binding. Other providers, linked projects, remote sessions, API sessions and workers retain normal completion rules and receive no quiet-study exemption.

Before file edits, saving deliverables or delegating work, the agent starts tracked work with normal `dock_context()`. Paddock tools that mutate state and all connected-tool calls, including read-only external queries, also acquire a tracked turn for these study consoles. Active work still requires an explicit `finish_turn` record, with the existing output, project and worker checks. Newly completed work must pass its first response check before later conversation can be quiet. That successful check closes its lifecycle: deleting a historical result or changing a historical worker's status does not reopen the work. Active, interrupted, invalidated or unchecked work remains blocked. Explicit `finish_turn` and `notify({kind:"ready"})` calls retain their strict checks.

In eligible study consoles, error notifications and interruption callbacks invalidate active or not-yet-response-checked work. A quiet answer's error still surfaces, while the previous successfully checked and closed turn stays historical. Non-study invalidation behavior is unchanged.

A study refresh never resets another agent's active turn. A callback rechecks completion inside the finish queue and closes only the turn ID it checked. A delayed quiet callback cannot clear a newer task's active state; other metadata updates from that event are still published. Concurrent work sharing a console remains tracked; quiet study is allowed only when that work has passed completion.

Development consoles execute the callback helper from source. If their running host does not yet expose `agent_response`, the helper falls back to the existing start/finish routes only for the explicit unknown-tool response. Completion errors never trigger that fallback. Load the updated host and refresh the MCP helper's schema together when applying the extension.

The original study-refresh extension was reviewed, tested during the break and activated. Its verification is recorded below. The general task-context receipt extension is verified separately below.

For the current Agentdock project, the measured default fell from 26,149 to 3,667 characters (86%). These are character counts, with token estimates around 6,500 and 900 at four characters per token; they are not tokenizer or billing measurements. Installed-skill names and changing instructions can change the size. Relevant project/reference reads still consume context.

## Completion check

Before signalling ready, the agent calls `dock/finish_turn` with:

```json
{
  "turnId": "the current ID from dock_context",
  "outcome": "changed",
  "summary": "Implemented the contact form; validation checks passed.",
  "nextStep": "Review the rendered contact page.",
  "outputs": "none"
}
```

For a question or an inspection within tracked work that changes no project work, use `outcome:"no-change"` and explain that in the summary. Use `nextStep:"None"` when appropriate. Requested files are first saved through `dock/save_result`; declare `outputs:"saved"` and their `resultIds`. Routine code work does not require a gallery entry.

The server checks the turn and project binding, required fields, declared output ownership and presence, and delegated task status. It refreshes delegated verification before accepting completion. Changed work requires the project context to have been read. Unfinished tasks, missing reports and stale verification prevent completion. Findings block completion unless the user explicitly accepted that task; accepted issues are retained in the completion record. Later tool mutations invalidate the recorded check. An empty `finish_turn` call only validates an existing completion; CLI callbacks cannot use it to invent one.

A successful changed outcome updates the linked project's `lastProgress` and `nextStep`. It preserves milestone flags, approvals and old notes. Completion records are stored separately under `<data>/turn-completions/<turnId>.json` and served through history reads. Duplicate checks do not append project notes. `project_progress` remains available for explicitly verified milestones and returns a compact acknowledgement.

`dock/notify` with `kind:"ready"` requires the checkpoint. For tracked work, Codex and Claude callbacks report attention when it is missing; Claude's first Stop callback requests completion through the hook's blocking response. Ordinary study responses use the quiet path described above. The dashboard guards native ready events for agent consoles too. API responses without a checkpoint are marked incomplete, with an explanation; this does not trigger an additional model request. Questions/errors remain reportable. Interrupted turns can close using `finish_turn({interrupted:true})`; interruption does not satisfy the ready check.

The check verifies recorded state and declared outputs. It cannot prove that a prose summary is true or infer every requested deliverable from a conversation. Agents still need to report scope and verification honestly. Provider outages, capacity waits and user approvals can still require action.

## Workers

`dock/start_task` binds the calling console's explicit project to the job. Tasks started from the page use the closest unambiguous saved project folder. The job retains its project ID, and reports carry that ID. Builder, planner and reviewer prompts receive the current linked project brief; split children inherit the parent's project. History is omitted. Existing website guidance is included for matching website work.

Worker permissions remain unchanged. Workers report completed work, verification, remaining issues and next steps to the orchestrator. Paddock maintains task state and reports; the lead agent passes the completion check and records the project outcome. The lead still supplies the concrete task criteria, selected conversational references and checks command.

## Verification

Evidence is in `artifacts/workspace-review/compact-*.log` and `context-size.json`. Regression coverage includes compact/scoped context, complete history pagination, project binding, saved-output ownership/deletion, stale or unfinished workers, idempotent updates, no-change turns, native callback bypass attempts and API completion without additional requests. Full Windows unit and headless Linux unit/desktop results are recorded in `COMPLETION-VERIFICATION.md` in that directory. Tests use temporary profiles and mocked providers; no paid model requests are needed.

31 October study-extension verification: Opus approved the original patch and the historical-completion follow-up for testing. Focused checks passed (82 passed, 1 skipped). The full suite passed on Windows (687 passed, 1 skipped) and Linux (682 passed, 6 skipped); build and headless desktop checks passed. Three pre-existing prototype-based project tests required a non-study predicate in their completion doubles; no production fallback was added. Review handoffs, isolated patches and logs are under `node_modules/.cache/paddock-study-review-7b93279b/`. A live unchanged-reflection refresh measured 277 characters versus the earlier 5,948-character full context. Source checks cover quiet callbacks, historical-result deletion, active-work invalidation and queue races; the user restarted the host at 20:13:41 Budapest time on 31 October, activating the final corrections.


31 October general task-context receipt verification: Astra reviewed the scoped patch and approved it after a quiet-study eligibility wording correction. Final Windows suite: 698 passed, 1 skipped. Final Linux suite: 693 passed, 6 skipped. Build and all headless desktop checks passed; tests made no provider requests. The existing Paddock process (PID 35892) loaded the reviewed methods without replacing sessions or completion state. Both running MCP helpers received the current schemas and a tool-list-changed notification. A real call through the existing client accepted the new receipt: the full response was 7,211 characters and the unchanged response was 820 (88.6% smaller). Live timer/history remained fresh. A deliberately stale receipt returned current full instructions. These are character measurements, not billed-token or tool-call reductions. Project context now fits in the task-start call; normal quiet tutoring still requires no such call. Temporary inspectors were closed. Evidence and scoped patch: `node_modules/.cache/context-revision-20261031/`.


## Foreground notifications

`finish_turn` checks window focus when recording completion and returns `notifyReady:false` while Paddock is focused, visible and not minimized. The agent then omits the separate ready-notification call. The console still receives its ready state. Background completion retains the existing notification policy. This changes no completion or approval checks. Native toasts and tray fallbacks are also suppressed while Paddock is focused, including delayed fallback after the user returns to the app. In-app status and actionable questions remain available.

Foreground-notification verification: 33 focused tests passed; Windows 701 passed/1 skipped, Linux 696 passed/6 skipped, build and headless desktop checks passed. Activated in the existing host without restarting sessions. Evidence: `node_modules/.cache/foreground-notifications-20261031/`.
