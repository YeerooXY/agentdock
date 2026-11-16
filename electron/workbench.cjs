'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Results } = require('./results.cjs');
const { AlertEvents } = require('./alerts.cjs');
const { Reviews, checklist } = require('./reviews.cjs');
const { Concepts } = require('./concepts.cjs');
const { SetupRequests } = require('./setup-requests.cjs');
const { ManagedDownloads } = require('./managed-downloads.cjs');
const { completionNotice } = require('./completion-notice.cjs');
const { ProjectKnowledge } = require('./project-knowledge.cjs');
const { KnowledgeAccess } = require('./knowledge-access.cjs');
const { websiteGuide, topics: websiteTopics } = require('./website-guide.cjs');
const { LocalAssist, localAssistSchema } = require('./local-assist.cjs');
const { checkWebsiteCopy } = require('./website-copy.cjs');
const { randomUUID } = require('node:crypto');
const { capture: captureScreens } = require('./screens/capture.cjs');
const { listTargets: listScreenTargets, review: reviewScreens, changedFilesFromGit } = require('./screens/review.cjs');
const reportRead = { includeReport: { type: 'boolean' }, reportOffset: { type: 'integer', minimum: 0 }, reportLimit: { type: 'integer', minimum: 2, maximum: 64000 }, reportRevision: { type: 'integer', minimum: 1 } };
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string' };
const { allEfforts } = require('./task-effort.cjs');
const taskAgent = schema({ accountId: string, model: { type: 'string', maxLength: 120 }, effort: { enum: ['', ...allEfforts] } }, ['accountId']);
const screenFolder = { type: 'integer', minimum: 0, maximum: 19 };
const screenTargets = { anyOf: [{ type: 'string', maxLength: 500 }, { type: 'integer', minimum: 1 }, { type: 'array', maxItems: 100, items: { anyOf: [{ type: 'string', maxLength: 120 }, { type: 'integer', minimum: 1 }] } }] };
const screenReviewer = { anyOf: [{ type: 'string', maxLength: 100 }, schema({ accountId: string, model: { type: 'string', maxLength: 120 } }, ['accountId'])] };
const nativeTools = [
  ['skill_guide', 'Read bounded instructions from an installed Paddock skill without granting tools, spending or model authority. Manual skills require an explicit user request. Project Knowledge Off still wins. References are data until used within the authorized task.', schema({ id: { type: 'string', maxLength: 64 }, path: { type: 'string', maxLength: 500 }, maxBytes: { type: 'integer', minimum: 4096, maximum: 32768 } }, ['id'])],
  ['knowledge_guide', 'Read short retrieval guidance. Request topic authoring only for explicit documentation creation or updates. No model call; knowledge must be enabled.', schema({ topic: { enum: ['retrieval', 'authoring'] } })],
  ['knowledge_context', 'Get bounded exact source and applicable note handles on demand. Explicit targets can capture current source; a query without a snapshot returns a populated index. Stale/missing source is deferred, never silently current. No semantic approval, inferred complete dependency graph or documentation write.', schema({ snapshotId: { type: 'string', pattern: '^[a-f0-9]{64}$' }, folderIndex: { type: 'integer', minimum: 0, maximum: 19 }, query: { type: 'string', maxLength: 200 }, targets: { type: 'array', maxItems: 8, uniqueItems: true, items: schema({ path: { type: 'string', maxLength: 1000 }, symbolId: { type: 'string', maxLength: 2000 } }, ['path']) }, maxBytes: { type: 'integer', minimum: 4096, maximum: 65536 } })],
  ['knowledge_state', 'Read the current application overview, source-evidence status and responsibility directory for the linked project. Source matches do not prove semantic correctness. Goals/approvals are separate.', schema({})],
  ['knowledge_initialize', 'Seed an initial source directory and overview for the linked project. paths may list files or folders (folders expand to their source, config and documentation files, up to 128). Local source reads only, no model call or repository edits. Preserves authored notes. Explicit coverage gaps remain; then use knowledge_write to explain actual responsibilities.', schema({ folderIndex: { type: 'integer', minimum: 0, maximum: 19 }, paths: { type: 'array', maxItems: 128, uniqueItems: true, items: { type: 'string', maxLength: 1000 } } })],
  ['knowledge_write', 'Publish bounded inferred documentation with pinned live source evidence and per-section expected versions. Cannot approve owner intent or overwrite protected records. Use role overview for the stable overview ID from knowledge_initialize/state; responsibility/flow for other sections. A source anchor is a declaration ID from source resolve, such as path:name:function; omit it to cite the whole file.', schema({ snapshotId: { type: 'string', pattern: '^[a-f0-9]{64}$' }, operationId: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,100}$' }, sections: { type: 'array', minItems: 1, maxItems: 16, items: schema({ id: { type: 'string', pattern: '^[a-z][a-z0-9_:-]{0,95}$' }, expectedVersion: { type: 'integer', minimum: 0 }, role: { enum: ['overview', 'responsibility', 'flow'] }, title: { type: 'string', maxLength: 240 }, summary: { type: 'string', maxLength: 8192 }, sources: { type: 'array', minItems: 1, maxItems: 32, items: schema({ path: { type: 'string', maxLength: 1000 }, anchor: { type: 'string', maxLength: 512 } }, ['path']) }, links: { type: 'array', maxItems: 32, uniqueItems: true, items: { type: 'string', pattern: '^[a-z][a-z0-9_:-]{0,95}$' } } }, ['id', 'expectedVersion', 'role', 'title', 'summary', 'sources']) } }, ['snapshotId', 'operationId', 'sections'])],
  ['check_website_copy', 'Check supplied rendered visible text for known generic slogans, website demo labels, promotional reversals and possible encoding errors. Deterministic; no model call or file edits. Return evidence and line positions. Returns detected wording patterns for caller review.', schema({ text: { type: 'string', maxLength: 100000 } }, ['text'])],
  ['local_assist', 'Run one bounded text request on the configured local Strata server: extract facts, draft a component, critique supplied text or propose creative compositions. No tools, file edits, automatic retries or cloud fallback. Supply only relevant text (up to 24000 characters). Default 2048 output tokens, reasoning none, 90-second deadline. Reuse requestId only for the same request in this turn; the last 128 requests are deduplicated until app restart. Output requires caller verification. Usage goes to the API ledger.', localAssistSchema],
  ['knowledge_adopt_map', "Adopt a proposed responsibility map from a JSON file inside this project's saved folder. Validates all declared observed source hashes against a pinned selection. Writes only inferred/proposed references, preserves owner intent and rejects existing foreign/retired IDs. Does not execute repository scripts or approve project plans.", schema({ folderIndex: { type: 'integer', minimum: 0, maximum: 19 }, mapPath: { type: 'string', maxLength: 1000 } }, ['mapPath'])],
  ['knowledge_resolve', "Resolve section suggestions and source declarations. Numeric addresses require the current directoryViewId; durable links use stable IDs. Unmapped symbols return coverage gaps.", schema({ query: { type: 'string', maxLength: 200 }, snapshotId: { type: 'string', pattern: '^[a-f0-9]{64}$' }, directoryViewId: { type: 'string', pattern: '^[a-f0-9]{64}$' }, addresses: { type: 'array', maxItems: 32, items: { type: 'string', pattern: '^[1-9][0-9]*$' } } })],
  ['knowledge_bundle', "Assemble requested complete saved sections and exact pinned source declarations within a UTF-8 response budget. remainingSources and knowledge.remainingIds are explicit deferred context. No inferred call-graph completeness.", schema({ ids: { type: 'array', maxItems: 16, items: { type: 'string' } }, snapshotId: { type: 'string', pattern: '^[a-f0-9]{64}$' }, sources: { type: 'array', maxItems: 16, items: { type: 'object', additionalProperties: false, properties: { path: { type: 'string', maxLength: 1000 }, symbolId: { type: 'string', maxLength: 2000 } }, required: ['path'] } }, maxBytes: { type: 'integer', minimum: 4096, maximum: 262144 } })],
  ['knowledge_source_capture', "Capture immutable exact UTF-8 sources from a saved project folder without executing code. Reads source contents; private names, detected secrets, links, invalid text and large files are excluded explicitly. Default selection is bounded and may be partial. Does not call a model.", schema({ folderIndex: { type: 'integer', minimum: 0, maximum: 19 }, paths: { type: 'array', minItems: 1, maxItems: 512, uniqueItems: true, items: { type: 'string', maxLength: 1000 } }, maxFiles: { type: 'integer', minimum: 1, maximum: 512 } })],
  ['knowledge_source_resolve', "Find syntax declarations in a pinned project source snapshot. JavaScript/TypeScript syntax index only; unsupported languages retain exact-file fallback. No type/call graph completeness claim.", schema({ snapshotId: { type: 'string', pattern: '^[a-f0-9]{64}$' }, query: { type: 'string', maxLength: 200 }, cursor: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, ['snapshotId'])],
  ['knowledge_source_extract', "Read a whole exact declaration or file from a pinned snapshot. Hashes, UTF-8 byte offsets and coverage are returned. Over-budget source is deferred whole, never silently truncated. Knowledge must be enabled and the root must still belong to this project.", schema({ snapshotId: { type: 'string', pattern: '^[a-f0-9]{64}$' }, path: { type: 'string', maxLength: 1000 }, symbolId: { type: 'string', maxLength: 2000 }, maxBytes: { type: 'integer', minimum: 1024, maximum: 262144 } }, ['snapshotId', 'path'])],
  ['knowledge_inventory', "Create or refresh a bounded local metadata inventory for one saved folder of this console's project. Project knowledge must be enabled. No model call or source-content read. Records an unverified inventory summary; does not generate architecture contracts.", schema({ folderIndex: { type: 'integer', minimum: 0, maximum: 19 } })],
  ['knowledge_directory', "Read a paged directory of persisted knowledge sections for this console's linked project. Metadata only: source inventory, semantic truth and actual source freshness are not verified. Continue with nextCursor; cursors reject changed revisions. Reads do not initialize or modify projects.", schema({ cursor: { type: 'string', maxLength: 512 }, limit: { type: 'integer', minimum: 1, maximum: 100 } })],
  ['knowledge_read', "Read complete persisted knowledge sections by stable ID for this console's linked project. Pass the directory revision to pin the read. maxBytes is a UTF-8 response budget, not a token estimate. remainingIds and requiredBytes indicate deferred whole sections; no semantic prose is truncated. decompositionRequired flags records exceeding the maximum read budget. recorded fields retain their original claims, with explicit unverified source/semantic assurance.", schema({ ids: { type: 'array', minItems: 1, maxItems: 32, uniqueItems: true, items: { type: 'string', pattern: '^[a-z][a-z0-9_:-]{0,95}$' } }, revision: { type: 'integer', minimum: 0 }, maxBytes: { type: 'integer', minimum: 2048, maximum: 262144 } }, ['ids'])],
  ['task_candidates', 'List accounts once with compact quota windows; implementers/reviewers are account IDs. Unknown quota has a separate short list. Set refresh:true to run the existing Usage refresh before discovery. Automatic free routes are limited to small tasks. Use accountId for full account/model details. Funding, freshness and local readiness remain explicit; assess model capability and context before start_task. Task folders default to the calling console.', schema({ size: { enum: ['small','medium','large'] }, refresh: { type: 'boolean' }, accountId: { type: 'string', minLength: 1, maxLength: 100 } })],
  ['task_status', 'Read task progress, checks, review findings and changes. Use detail for the full view and waitSeconds to wait up to 45 seconds. Use the id returned by start_task and the same repo (defaults to the calling console folder).', schema({ id: string, repo: string, detail: { type: 'boolean' }, waitSeconds: { type: 'integer', minimum: 0, maximum: 45 }, ...reportRead }, ['id'])],
  ['close_task', 'Close a task this console started once it has stopped: it leaves the Tasks list and attention counts; its technical record stays in execution history. Use after task_status for a failed, superseded or replaced task, with a short reason the owner can read. A task with no live worker console (queued or waiting for an account) is stopped first; one with a running worker console needs the owner to stop it.', schema({ id: string, reason: { type: 'string', minLength: 1, maxLength: 300 }, repo: string }, ['id', 'reason'])],
  ['start_task', 'Start an agent task. Use title and criteria to describe the goal and acceptance criteria. repo defaults to the calling console folder. Progress shows on the Tasks page, where a split plan may need the user\'s approval before work starts. Use task_candidates for each account’s supported effort settings. Choose installed account IDs; split tasks can use configured routing defaults. Checks run in the task folder. workflow defaults to current; a separate worktree requires the user\'s request. Agents may use subscription or API credits.', schema({ title: { type: 'string', minLength: 1, maxLength: 200 }, criteria: { type: 'string', minLength: 1, maxLength: 12000 }, repo: string, implementer: taskAgent, planner: taskAgent, reviewer: { anyOf: [taskAgent, { type: 'null' }] }, split: { type: 'boolean' }, visualReview: { type: 'boolean' }, checks: { type: 'string', maxLength: 4000 }, workflow: { enum: ['current','worktree'] }, maxRounds: { type: 'integer', minimum: 1, maximum: 5 }, timeLimitMinutes: { type: 'integer', minimum: 5, maximum: 120 } }, ['title','criteria'])],
  ['download_tool_repository', 'Download an authorized public GitHub tool repository into Paddock’s managed downloads folder and record its location for manual cleanup at uninstall. Does not build, install or run its code. Do not use this for user projects.', schema({ source: { type: 'string', maxLength: 500 }, name: { type: 'string', minLength: 1, maxLength: 120 } }, ['source'])],
  ['website_guide', 'Read interface design guidance for websites, desktop/Electron/mobile apps, game menus, dashboards and internal tools. Use app for application design. Start with overview, then choose relevant topics. Includes wording, layout, color, fonts, motion, loading and cross-platform verification. Read-only; no network calls.', schema({ topic: { type: 'string', enum: Object.keys(websiteTopics) } })],
  ['setup_status', 'Read compact setup readiness, installed agents, connections, saved key names and pending request IDs. Use detail for full configuration and installation details. Never returns key values.', schema({ detail: { type: 'boolean' } })],
  ['prepare_setup', 'Prepare a tool connection, model API, image generator or key-entry request in Tools. The user reviews and applies it there. config uses the Tools form fields: tool {id,name,type,command,args,envKeys} or {id,name,type,url,headerKeys}; API {id,name,protocol,url,keyId}; image {provider,model,url,keyId,previewFirst} with provider agent/openai/gemini/meshy/compatible; key {id,name}. Key bindings use vault IDs, never secret values. Does not install software, send API requests or change an active connection.', schema({ kind: { enum: ['tool','api','key','image'] }, config: { type: 'object' } }, ['kind','config'])],
  ['project_create', 'Save a project for existing local folders. knowledgeMode (inherit, off, read, automatic) can only lower the global mode. Returns the existing project when the first folder is already saved. Not available to task workers.', schema({ name: { type: 'string', maxLength: 64 }, folders: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', maxLength: 1000 } }, knowledgeMode: { enum: ['inherit', 'off', 'read', 'automatic'] } }, ['name', 'folders'])],
  ['set_knowledge', 'Set Knowledge modes or the documentation worker when the owner asks. Sets the global mode (off, read, automatic), the worker {accountId, model, funding: included|free|local} and a project mode. Uses the same validation as Settings. Automatic upkeep spends the worker allowance. Not available to task workers.', schema({ knowledgeMode: { enum: ['off', 'read', 'automatic'] }, worker: schema({ accountId: { type: 'string', maxLength: 140 }, model: { type: 'string', maxLength: 120 }, funding: { enum: ['included', 'free', 'local'] } }, ['accountId', 'model', 'funding']), projectId: { type: 'string', maxLength: 100 }, projectMode: { enum: ['inherit', 'off', 'read', 'automatic'] } })],
  ['console_open', 'Open an agent console in a saved project folder. It uses the owner\'s default agent permissions; provider is the console type (for example claude, codex, antigravity); model and effort are optional. Not available to task workers.', schema({ projectId: { type: 'string', maxLength: 100 }, provider: { type: 'string', maxLength: 40 }, model: { type: 'string', maxLength: 200 }, effort: { enum: ['low', 'medium', 'high', 'xhigh', 'max'] }, name: { type: 'string', maxLength: 64 } }, ['projectId', 'provider'])],
  ['notify', 'Signal console status and send a live completion, question or error notification. No notification history is stored in Paddock.', schema({ title: string, message: string, kind: { enum: ['ready','question','error'] } })],
  ['review_page', 'Review an HTTP(S) interface across Chromium desktop, WebKit desktop, Android Chrome and iPhone WebKit emulation, with axe and deterministic unstyled hints. Reports missing engines; physical devices and native-shell checks remain manual. Returns an ID for review_details.', schema({ url: string, brief: string }, ['url'])],
  ['review_details', 'Get review findings, checklist and screenshot availability. Viewport page fields override report.commonPage. Set detail:true for the original full page data.', schema({ id: string, detail: { type: 'boolean' } }, ['id'])],
  ['list_reviews', 'List saved website reviews as id, URL, state and issue count. Use review_details for findings, checklists and evidence.', schema({})],
  ['review_check', 'Record a website checklist outcome with evidence or a reason. Indexes 0–19 are the page review and 20–69 the security review. Updates the saved review report.', schema({ id: string, index: { type: 'integer', minimum: 0, maximum: checklist.length - 1 }, status: { enum: ['unreviewed','passed','needs-work','not-applicable'] }, note: { type: 'string', maxLength: 1000 } }, ['id','index','status'])],
  ['console_stop', 'Ask the owner to interrupt or stop a local console in this project. Requires its current launchId. Every call presents an owner confirmation; cancellation leaves it running. Task workers and remote consoles use their existing controls.', schema({ id: string, launchId: string, action: { enum: ['interrupt', 'stop'] } }, ['id', 'launchId'])],
  ['delete_review', 'Delete a completed or interrupted website review and its saved evidence. Running reviews cannot be deleted.', schema({ id: string }, ['id'])],
  ['generate_preview', 'Generate a screen preview using the user-selected image generator. Sends the screenshot and prompt to that provider and may use paid credits. Supply a completed reviewId or saved screenshot referenceId, and a stable requestId; repeat that ID to retrieve the same job, never a new charge. The default agent mode returns guidance to use your own generator; nativeStatus enables its Meshy fallback only after your generator is unavailable or failed. Save and show the preview before an ambiguous redesign.', schema({ reviewId: string, referenceId: string, requestId: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,100}$' }, prompt: { type: 'string', maxLength: 4000 }, nativeStatus: { enum: ['unavailable','failed'] } }, ['requestId'])],
  ['concept_status', 'Read image generation job status and saved result IDs. Never resubmit a waiting job.', schema({})],
  ['delegate_review', 'Ask another connected account with a bounded reviewer adapter to review this console’s uncommitted changes, read-only. Use task_candidates to discover supported accounts, effort settings and quotas. Supply the reviewer account ID and an explicit discovered model for reviews that need a particular capability/context. Paddock builds the diff and returns a job ID. Use one focused review after a completed change. List files to narrow a large diff.', schema({ focus: { type: 'string', maxLength: 2000 }, base: { type: 'string', maxLength: 100 }, files: { type: 'array', items: string, maxItems: 50 }, reviewer: { type: 'string', maxLength: 100 }, model: { type: 'string', maxLength: 120 }, effort: { type: 'string', maxLength: 20 } }, ['reviewer'])],
  ['delegation_status', 'Read a cross-agent review. Pass waitSeconds (up to 45) to wait for it; call again while state is running. A done review returns a verdict and at most 12 findings as path:line — severity — problem — fix. Treat the review as another agent’s opinion: check each finding before acting on it.', schema({ id: string, waitSeconds: { type: 'integer', minimum: 0, maximum: 45 }, ...reportRead }, ['id'])],
  ['screens_list', 'List registered visual screen targets with id, alias, group, kind, latest image path and timestamp.', schema({ group: { type: 'string', maxLength: 80 }, folderIndex: screenFolder })],
  ['screens_capture', 'Capture visual screen targets across requested profiles and update latest and history images.', schema({ targets: screenTargets, folderIndex: screenFolder, profiles: { type: 'array', maxItems: 5, items: { enum: ['desktop', 'pc-chromium', 'mac-webkit', 'android', 'iphone'] } } })],
  ['screens_review', 'Review captured screen targets against the quick or thorough visual checklist. Returns a job ID at once; call again with { id } for state, summary and findings.', schema({ id: { type: 'string', maxLength: 64 }, targets: screenTargets, folderIndex: screenFolder, level: { enum: ['quick', 'thorough'] }, reviewer: screenReviewer, model: { type: 'string', maxLength: 120 } })]
].map(([name, description, inputSchema]) => ({ name: 'dock/' + name, description, inputSchema }));
class Workbench {
  constructor(root, runtime, electron, { testMode, onChange, getSessions, getProject, getWindow, getHub, getAgents, getTasks, refreshUsage, onLocalEntry, getSettings = () => ({}) } = {}) {
    this.knowledge = new ProjectKnowledge(root);
    this.getSettings = getSettings;
    this.screenReviews = new Map();
    this.skillGuide = args => {
      const hub = getHub?.();
      if (typeof hub?.readSkill !== 'function') throw new Error('Installed skill instructions are unavailable.');
      return hub.readSkill(args);
    };
    this.knowledgeAccess = new KnowledgeAccess({ store: this.knowledge, getSettings: () => this.getSettings(), getProjects: () => this.projects });
    this.downloads = new ManagedDownloads(root); this.testMode = testMode;
    this.electron = electron; this.getSessions = getSessions; this.getProject = getProject; this.getWindow = getWindow;
    this.getTasks = getTasks;
    this.refreshUsage = refreshUsage;
    this.localAssist = new LocalAssist({ getProfiles: () => getHub?.()?.config.profiles || [], onEntry: onLocalEntry, testMode });
    this.results = new Results(root, { trash: file => fs.promises.rm(file, { recursive: true, maxRetries: 2, retryDelay: 100 }), nativeImage: electron.nativeImage });
    this.alerts = new AlertEvents(); this.reviews = new Reviews(root, this.results, this.alerts, electron);
    this.concepts = new Concepts(root, runtime, this.results, this.reviews, this.alerts, { testMode, getSettings: () => getHub?.()?.config.imageGeneration, getKey: id => getHub().vault.get(id), authorizePreview: (job, balance) => getHub().authorizePreview(job, balance) });
    this.setup = new SetupRequests(root, { getHub, getAgents, onChange });
    for (const service of [this.results, this.concepts]) service.on('changed', onChange);
  }
  // Screen targets live in a project folder: the console folder when it has a registry,
  // otherwise the linked project's saved folders (folderIndex picks one explicitly).
  screensFolder(session, context, args = {}) {
    const project = session?.projectId ? this.projects?.get?.(session.projectId) : null;
    const folders = (project?.folders || []).map(folder => folder.path).filter(Boolean);
    if (args.folderIndex != null) { if (!folders[args.folderIndex]) throw new Error('Choose an existing project folder.'); return folders[args.folderIndex]; }
    const candidates = [session?.cwd, context.project, ...folders, this.getProject?.()].filter(Boolean);
    const registered = candidates.find(dir => fs.existsSync(path.join(dir, '.paddock', 'screens', 'targets.json')));
    if (registered) return registered;
    if (!candidates.length) throw new Error('Open a project folder first.');
    throw new Error('No screen targets in this project. Add .paddock/screens/targets.json to a project folder.');
  }
  snapshot() { return { knowledgeEpoch: this.knowledgeAccess.upkeep?.epoch || 0, results: this.results.list().filter(item => item.reviewId || item.kind === 'concept'), concepts: this.concepts.list(), conceptUsage: this.concepts.usage, meshyAuth: this.concepts.auth, setupRequests: this.setup.items }; }
  // Cross-agent review tools are listed only while the user has them turned on.
  tools(owner) {
    const session = owner ? this.getSessions?.()?.items.get(owner) || this.turns?.session(owner) : null;
    // Project, console and Knowledge administration stays out of task worker tool lists.
    const admin = ['dock/project_create', 'dock/console_open', 'dock/set_knowledge'];
    return nativeTools.filter(tool => !(session?.taskId && admin.includes(tool.name)) && (!tool.name.startsWith('dock/delegat') || this.delegation?.getSettings()?.delegationEnabled === true) &&
      (!tool.name.startsWith('dock/knowledge_') || (session ? this.knowledgeAccess?.enabled(session.projectId) === true : ['read', 'automatic'].includes(this.getSettings?.()?.knowledgeMode))));
  }
  async invoke(name, args, owner) {
    const session = owner ? this.getSessions().items.get(owner) || this.turns?.session(owner) : null;
    if (owner && !session?.alive) throw new Error('This console is no longer open.');
    if (session?.taskId && ['dock/knowledge_initialize', 'dock/knowledge_write'].includes(name)) {
      const parent = this.getTasks?.()?.jobs.get(session.taskId), job = parent?.subtasks?.find(item => item.id === session.sliceId) || parent;
      if (!job || !['implementing', 'building'].includes(job.state)) throw Error('Documentation writes are unavailable to planning/review workers.');
    }
    const context = this.turns?.context(owner) || { project: session?.cwd || this.getProject(), projectId: session?.projectId || null, sessionId: session?.id || null, consoleKey: session?.consoleKey || session?.id || null, consoleName: session?.name || '' };
    switch (name) {
      case 'dock/check_website_copy': return checkWebsiteCopy(args.text);
      case 'dock/local_assist': return this.localAssist.run(args, context);
      case 'dock/skill_guide': {
        if (args.id === 'project-documentation' && !this.knowledgeAccess.enabled(session?.projectId)) throw new Error('Project Knowledge is off or no project is linked.');
        return this.skillGuide(args);
      }
      case 'dock/knowledge_directory':
      case 'dock/knowledge_guide':
      case 'dock/knowledge_context':
      case 'dock/knowledge_state':
      case 'dock/knowledge_initialize':
      case 'dock/knowledge_write':
      case 'dock/knowledge_adopt_map':
      case 'dock/knowledge_resolve':
      case 'dock/knowledge_bundle':
      case 'dock/knowledge_source_capture':
      case 'dock/knowledge_source_resolve':
      case 'dock/knowledge_source_extract':
      case 'dock/knowledge_read':
      case 'dock/knowledge_inventory': {
        if (!session?.projectId || !this.projects?.get(session.projectId)) throw new Error('Link this console to an existing project first.');
        if (name === 'dock/knowledge_guide') return this.knowledgeAccess.guide(session.projectId, args);
        if (name === 'dock/knowledge_context') return this.knowledgeAccess.context(session.projectId, args);
        if (name === 'dock/knowledge_state') return this.knowledgeAccess.state(session.projectId);
        if (name === 'dock/knowledge_initialize') return this.knowledgeAccess.initialize(session.projectId, args);
        if (name === 'dock/knowledge_write') return this.knowledgeAccess.write(session.projectId, args);
        if (name === 'dock/knowledge_adopt_map') return this.knowledgeAccess.adopt(session.projectId, args);
        if (name === 'dock/knowledge_resolve') return this.knowledgeAccess.resolve(session.projectId, args);
        if (name === 'dock/knowledge_bundle') return this.knowledgeAccess.bundle(session.projectId, args);
        if (name === 'dock/knowledge_source_capture') return this.knowledgeAccess.sourceCapture(session.projectId, args);
        if (name === 'dock/knowledge_source_resolve') return this.knowledgeAccess.sourceResolve(session.projectId, args);
        if (name === 'dock/knowledge_source_extract') return this.knowledgeAccess.sourceRead(session.projectId, args);
        if (name === 'dock/knowledge_inventory') return this.knowledgeAccess.capture(session.projectId, args);
        return name === 'dock/knowledge_directory' ? this.knowledgeAccess.directory(session.projectId, args) : this.knowledgeAccess.read(session.projectId, args);
      }
      case 'dock/task_candidates': {
        const tasks = this.getTasks?.();
        if (!tasks) throw new Error('Tasks are unavailable.');
        if (args.refresh) {
          if (!this.refreshUsage) throw new Error('Usage refresh is unavailable in this host.');
          await this.refreshUsage();
        }
        const { accounts, implementers, reviewers, assignment } = tasks.choices(undefined, args);
        if (args.accountId) {
          const account = accounts.find(item => item.id === args.accountId);
          if (!account) throw new Error('Task account not found.');
          return { account, implementer: implementers.some(item => item.id === account.id), reviewer: reviewers.some(item => item.id === account.id) };
        }
        const unknown = [], known = [];
        for (const account of accounts) {
          const { allowance } = account;
          if (allowance.status === 'unknown') {
            unknown.push({ id: account.id, funding: account.funding,
              ...(account.signedIn !== null ? { signedIn: account.signedIn } : {}),
              ...(account.workerSupported === false ? { workerSupported: false } : {}),
              reason: account.quotaMessage || account.unavailableReason || account.quotaReader || 'No quota reading.' });
            continue;
          }
          known.push({ id: account.id, provider: account.provider, label: account.label, funding: account.funding, signedIn: account.signedIn,
            ...(account.model ? { model: account.model } : {}), ...(account.models ? { modelCount: account.models.length } : {}),
            ...(account.available !== undefined ? { available: account.available } : {}),
            ...(account.local ? { local: true, readiness: account.readiness, checkedAt: account.checkedAt, loadedModel: account.loadedModel } : {}),
            ...(account.quotaMessage ? { quotaMessage: account.quotaMessage } : {}),
            ...(account.modelMessage ? { modelMessage: account.modelMessage } : {}),
            allowance: { status: allowance.status, observedAt: allowance.observedAt, remainingPercent: allowance.remainingPercent, blocked: allowance.blocked,
              windows: allowance.windows.map(window => ({ label: window.label, remainingPercent: Number.isFinite(window.usedPercent) && window.usedPercent >= 0 && window.usedPercent <= 100 ? Number((100 - window.usedPercent).toFixed(6)) : null,
                reset: window.resetsAt ?? window.resetLabel ?? null,
                ...(window.unlimited ? { unlimited: true } : {}), ...(window.notApplicable ? { notApplicable: true } : {}) })) } });
        }
        return { accounts: known, unknown, implementers: implementers.map(item => item.id), reviewers: reviewers.map(item => item.id), assignment };
      }
      case 'dock/task_status': {
        const tasks = this.getTasks?.();
        if (!tasks) throw new Error('Tasks are unavailable.');
        return tasks.status(args.id, args.repo ?? session?.cwd ?? context.project ?? this.getProject(), args);
      }
      case 'dock/close_task': {
        const tasks = this.getTasks?.();
        if (!tasks) throw new Error('Tasks are unavailable.');
        // An agent closes only tasks its own console started; others stay with the owner.
        const job = await tasks.status(args.id, args.repo ?? session?.cwd ?? context.project ?? this.getProject());
        const ownsTask = job.originConsoleKey ? !!session?.consoleKey && job.originConsoleKey === session.consoleKey : !!session?.id && job.originConsoleId === session.id;
        if (!ownsTask) throw new Error('Only the console that started this task can close it. The owner can close it on the Tasks page.');
        // A task with no live worker console (queued or waiting for an account)
        // is stopped first; a live worker still needs the owner's Stop.
        const live = (this.getSessions()?.list?.() || []).some(item => item.taskId === args.id && item.processAlive);
        try { tasks.dismiss(args.id, { reason: args.reason, by: 'agent' }); }
        catch (error) {
          if (!/Stop the task/.test(error.message) || live) throw live ? new Error('A worker console for this task is still running. The owner stops it on the Tasks page.') : error;
          await tasks.stop(args.id);
          tasks.dismiss(args.id, { reason: args.reason, by: 'agent' });
        }
        return { id: args.id, closed: true };
      }
      case 'dock/start_task': {
        const tasks = this.getTasks?.();
        if (!tasks) throw new Error('Tasks are unavailable.');
        const job = await tasks.start({ ...args, repo: args.repo ?? session?.cwd ?? context.project ?? this.getProject(), ...(session?.projectId ? { projectId: session.projectId } : {}), originConsoleId: session?.id || null, originConsoleKey: session?.consoleKey || null });
        return { id: job.id };
      }
      case 'dock/download_tool_repository': {
        if (this.testMode) throw Error('Repository downloads are disabled during tests.');
        return this.downloads.download(args);
      }
      case 'dock/website_guide': return websiteGuide(args.topic);
      case 'dock/setup_status': return this.setup.status(args);
      case 'dock/prepare_setup': {
        const result = this.setup.prepare(args, context);
        this.alerts.send({ title: 'Setup ready: ' + (args.config.name || args.config.id || 'Screen previews'), message: result.message, kind: 'question', destination: 'tools' });
        return result;
      }
      case 'dock/set_knowledge':
        if (session?.taskId) throw new Error('Task workers cannot change Knowledge settings.');
        if (!this.knowledgeCommand) throw new Error('Knowledge settings are unavailable.');
        return require('./project-tools.cjs').knowledgeSettings(this.knowledgeCommand, this.projects, args);
      case 'dock/project_create':
      case 'dock/console_open': {
        if (session?.taskId) throw new Error('Task workers cannot create projects or open consoles.');
        const tools = require('./project-tools.cjs');
        return name === 'dock/project_create' ? tools.createProject(this.projects, args)
          : tools.openConsole({ projects: this.projects, sessions: this.getSessions(), settings: this.getSettings() }, args);
      }
      case 'dock/console_stop':
        return require('./console-control.cjs').stopConsole({ sessions: this.getSessions(), caller: session,
          confirm: async ({ name, action }) => (await this.electron.dialog.showMessageBox(this.getWindow(), {
            type: 'question', buttons: ['Keep running', action === 'stop' ? 'Stop console' : 'Interrupt'], defaultId: 0, cancelId: 0,
            message: `${action === 'stop' ? 'Stop' : 'Interrupt'} ${name}?`, detail: 'An agent requested this action. Files are kept.'
          })).response === 1 }, args);
      case 'dock/notify': {
        const kind = args.kind || 'ready';
        args = { ...args, title: args.title || (kind === 'ready' ? 'Ready' : kind === 'question' ? 'Needs your input' : 'Needs attention') };
        const turnId = ['ready', 'error'].includes(kind) ? await this.turns?.finish(owner) || context.turnId : context.turnId;
        this.getSessions().signal?.(context.sessionId, kind);
        return this.alerts.send(completionNotice({ ...args, kind }, { ...context, turnId }));
      }
      case 'dock/review_page': return { id: this.reviews.start({ ...args, ...context }) };
      case 'dock/review_details': {
        const review = this.reviews.get(args.id);
        const refs = new Set([...(review.report?.views || []).map(view => view.screenshot).filter(Boolean),
          ...this.results.items.filter(item => item.kind === 'screenshot' && (item.reviewId === review.id || item.groupId === review.id || review.resultIds?.includes(item.id))).map(item => item.id)]);
        const screenshots = [...refs].map(id => {
          const item = this.results.items.find(value => value.id === id);
          let file = null;
          if (item) try { file = this.results.path(id); if (!fs.existsSync(file)) file = null; }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
          return { id, title: item?.title || review.report?.views?.find(view => view.screenshot === id)?.name || '', file, status: file ? 'available' : 'missing' };
        });
        let report = review.report;
        if (!args.detail && report?.views?.length > 1) {
          const commonPage = Object.fromEntries(Object.entries(report.views[0].page || {}).filter(([key, value]) => report.views.every(view => JSON.stringify(view.page?.[key]) === JSON.stringify(value))));
          report = { ...report, commonPage, views: report.views.map(view => ({ ...view, page: Object.fromEntries(Object.entries(view.page || {}).filter(([key]) => !Object.hasOwn(commonPage, key))) })) };
        }
        return { ...review, report, screenshots };
      }
      case 'dock/list_reviews': return this.reviews.list().map(({ id, url, state, issues }) => ({ id, url, state, issues: issues ?? null }));
      case 'dock/review_check': this.reviews.check(args); return { id: args.id, check: this.reviews.get(args.id).checks[args.index] };
      case 'dock/delete_review': {
        if (this.reviews.active === args.id) throw new Error('Wait for this review to finish.');
        for (const job of this.concepts.items.filter(x => x.reviewId === args.id)) await this.concepts.remove(job.id);
        await this.reviews.remove(args.id); return { deleted: args.id };
      }
      case 'dock/generate_preview': return this.concepts.generate(args, context);
      case 'dock/delegate_review': {
        if (!this.delegation) throw new Error('Cross-agent reviews are unavailable.');
        return this.delegation.start(args, { sessionId: session?.id, provider: session?.provider, cwd: session?.cwd, consoleName: session?.name || '', context });
      }
      case 'dock/delegation_status': return this.delegation?.status(args.id, { ...args, sessionId: session?.id || null });
      case 'dock/screens_list': {
        const projectDir = this.screensFolder(session, context, args);
        if (!projectDir) throw new Error('Open a project folder first.');
        return (this.listScreens || listScreenTargets)(projectDir, { group: args?.group });
      }
      case 'dock/screens_capture': {
        const projectDir = this.screensFolder(session, context, args);
        if (!projectDir) throw new Error('Open a project folder first.');
        const targets = args?.targets ?? 'all';
        const changedFiles = targets === 'changed' && !Array.isArray(args?.changedFiles) ? changedFilesFromGit(projectDir) : args?.changedFiles;
        return (this.captureScreens || captureScreens)(projectDir, { ...args, targets, changedFiles });
      }
      case 'dock/screens_review': {
        if (args?.id) { const known = this.screenReviews.get(args.id); if (!known) throw new Error('Unknown screen review.'); return known; }
        const projectDir = this.screensFolder(session, context, args);
        if (!projectDir) throw new Error('Open a project folder first.');
        const id = randomUUID();
        const job = { id, state: 'running', projectDir, callerSessionId: session?.id || null, consoleName: session?.name || '', level: args?.level || 'quick', startedAt: Date.now(), finishedAt: null, summary: '', findings: [] };
        this.screenReviews.set(id, job);
        // Reviews take minutes; return the job now and let callers poll with { id }.
        (async () => {
          const result = await (this.reviewScreens || reviewScreens)(projectDir, {
            targets: args?.targets ?? 'all',
            level: args?.level || 'quick',
            reviewer: args?.reviewer,
            model: args?.model,
            candidates: this.delegation?.candidates?.() || [],
            limits: this.delegation?.getLimits?.() || [],
            routing: this.getSettings?.()?.taskRouting || {},
            spawnProcess: this.delegation?.spawnProcess,
            prepareAccount: this.delegation?.prepareAccount,
            releaseAccount: this.delegation?.releaseAccount,
            environment: this.delegation?.environment,
            runReviewer: this.screenReviewRunner,
          });
          Object.assign(job, result, { id, state: 'done', finishedAt: Date.now() });
        })().catch(error => { Object.assign(job, { state: 'failed', error: error.message, finishedAt: Date.now() }); });
        return { id, state: job.state, level: job.level, startedAt: job.startedAt };
      }
      case 'dock/concept_status': return this.concepts.list().map(job => {
        let file = null; if (job.resultId) { try { file = this.results.path(job.resultId); } catch {} }
        return { ...job, file };
      });
      default: throw new Error('Unknown Paddock tool.');
    }
  }
  async call(method, payload) {
    switch (method) {
      case 'setup.apply': return this.setup.apply(payload);
      case 'setup.dismiss': return this.setup.remove(payload);
      case 'images.preview': return this.results.preview(typeof payload === 'string' ? payload : payload?.id, payload?.thumbnail === true, payload?.entry, payload?.original === true);
      case 'concept.auth-status': return this.concepts.authStatus();
      case 'concept.connect': return this.concepts.connect();
      case 'concept.open-login': {
        if (this.concepts.auth.state !== 'waiting') throw new Error('Start Meshy sign-in first.');
        return this.electron.shell.openExternal(this.concepts.auth.url);
      }
      case 'concept.resume': return this.concepts.resume(payload);
      case 'concept.delete': return this.concepts.remove(payload);
      case 'delegation.stop': return this.delegation?.stop(payload);
      default: throw new Error('Unknown workbench action.');
    }
  }
  stop() { this.reviews.stop(); this.concepts.stop(); this.delegation?.stopAll(); }
}
module.exports = { Workbench };
