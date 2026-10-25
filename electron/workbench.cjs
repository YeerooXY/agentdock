'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Results } = require('./results.cjs');
const { AlertEvents } = require('./alerts.cjs');
const { Reviews, checklist } = require('./reviews.cjs');
const { Concepts } = require('./concepts.cjs');
const { SetupRequests } = require('./setup-requests.cjs');
const { resultGitContext } = require('./git-context.cjs');
const { ManagedDownloads } = require('./managed-downloads.cjs');
const { completionNotice } = require('./completion-notice.cjs');
const { websiteGuide, topics: websiteTopics } = require('./website-guide.cjs');
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string' };
const nativeTools = [
  ['download_tool_repository', 'Download an authorized public GitHub tool repository into Paddock’s managed downloads folder and record its location for manual cleanup at uninstall. Does not build, install or run its code. Do not use this for user projects.', schema({ source: { type: 'string', maxLength: 500 }, name: { type: 'string', minLength: 1, maxLength: 120 } }, ['source'])],
  ['downloaded_tools', 'Read Paddock’s recorded tool downloads and their manual-cleanup list path. Arbitrary Git commands outside the managed helper are not tracked.', schema({})],
  ['website_guide', 'Read the reusable website design research for marketing sites, apps, shops and other web projects. Start with overview, then choose relevant topics. Includes wording, layout, color, fonts, motion, loading and cross-platform verification. Read-only; no network calls.', schema({ topic: { type: 'string', enum: Object.keys(websiteTopics) } })],
  ['project_progress', 'Update the current project only: add a factual progress note, set the next step, or check an existing milestone (zero-based index). Only mark verified work done after roadmap approval. Guided plans require the current revision from project_plan for milestone updates.', schema({ note: string, nextStep: string, milestone: { type: 'integer', minimum: 0 }, done: { type: 'boolean' }, revision: { type: 'integer' } })],
  ['project_plan', 'Read one section of the current project plan, its revision, approvals, sections marked not needed, reference files and links, and later features. Defaults to the next section needing review. Sections are independent; only the roadmap must be approved to start work. Project selection belongs to the user.', schema({ section: { enum: ['brief', 'research', 'infrastructure', 'roadmap'] } })],
  ['propose_project_plan', 'Propose changes to one planning section after discussing it with the user. Each section holds at most one waiting proposal. This cannot approve a plan or activate a project. Changes remain separate until the user reviews them in Projects. Roadmap fields: scope (included), excluded (not included) and milestones. Read project_plan first for the field names and current revision.', schema({ section: { enum: ['brief', 'research', 'infrastructure', 'roadmap'] }, revision: { type: 'integer' }, changes: { type: 'object' } }, ['section', 'revision', 'changes'])],
  ['add_later_feature', 'Save an extra idea in the current project’s Later features file. This does not add it to approved scope or authorize implementation. Read project_plan for the current revision.', schema({ revision: { type: 'integer' }, text: { type: 'string', maxLength: 1000 } }, ['revision', 'text'])],
  ['start_turn', 'Track a new task and group requested outputs by chat and Git revision. Idempotent until finish_turn or a ready notification. Called automatically by dock_context. File-change capture is optional and off by default.', schema({})],
  ['finish_turn', 'Finish this task and link its saved outputs. With default settings this creates no Results entry unless an output was saved. Optional file-change capture requires an explicit setting.', schema({})],
  ['setup_status', 'Inspect installed agents, saved key names and shared tool/API settings. Never returns key values.', schema({})],
  ['prepare_setup', 'Prepare a tool connection, model API, image generator or key-entry request in Tools. The user reviews and applies it there. config uses the Tools form fields: tool {id,name,type,command,args,envKeys} or {id,name,type,url,headerKeys}; API {id,name,protocol,url,keyId}; image {provider,model,url,keyId,previewFirst} with provider agent/openai/gemini/meshy/compatible; key {id,name}. Key bindings use vault IDs, never secret values. Does not install software, send API requests or change an active connection.', schema({ kind: { enum: ['tool','api','key','image'] }, config: { type: 'object' } }, ['kind','config'])],
  ['save_result', 'Save a requested deliverable or a file the user chooses to keep: a document, image, design, research report, dataset or export. Do not save routine replies, progress logs, raw test data or patch copies just because a turn finished. Save requested files individually for previews; ZIP is optional. Files must be inside your project folder. The gallery keeps a copy.', schema({ file: string, text: string, title: string, kind: { enum: ['screenshot','concept','test','report','asset'] }, status: { enum: ['passed','failed','needs-review'] }, summary: string, groupId: string, ext: { enum: ['.md','.json','.txt'] } }, ['title'])],
  ['list_results', 'List saved results, newest first.', schema({})],
  ['notify', 'Signal console status and send a live completion, question or error notification. No notification history is stored in Paddock.', schema({ title: string, message: string, kind: { enum: ['ready','question','error'] } })],
  ['review_page', 'Start a Chromium website review at desktop and narrow widths, with axe checks and a manual checklist. Safari and physical-device checks require separate verification. Returns a job ID; read review_details later.', schema({ url: string, brief: string }, ['url'])],
  ['review_details', 'Get a website review, findings, checklist and reference screenshot paths.', schema({ id: string }, ['id'])],
  ['list_reviews', 'List saved website review IDs and progress. Review evidence is available in Results.', schema({})],
  ['review_check', 'Record a website checklist outcome with evidence or a reason. Indexes 0–19 are the page review and 20–69 the security review. Updates the saved review report in Results.', schema({ id: string, index: { type: 'integer', minimum: 0, maximum: checklist.length - 1 }, status: { enum: ['unreviewed','passed','needs-work','not-applicable'] }, note: { type: 'string', maxLength: 1000 } }, ['id','index','status'])],
  ['delete_review', 'Delete a completed or interrupted website review and its saved evidence. Running reviews cannot be deleted.', schema({ id: string }, ['id'])],
  ['meshy_concept', 'Fallback only: generate a 2D page concept with Meshy after your own image generator is unavailable or has failed. Uploads the reference screenshot to Meshy and uses credits. Requires Meshy CLI sign-in.', schema({ reviewId: string, nativeStatus: { enum: ['unavailable','failed'] }, prompt: string }, ['reviewId','nativeStatus'])],
  ['generate_preview', 'Generate a screen preview using the user-selected image generator. Sends the screenshot and prompt to that provider and may use paid credits. Supply a completed reviewId or saved screenshot referenceId, and a stable requestId; repeat that ID to retrieve the same job, never a new charge. The default agent mode returns guidance to use your own generator; nativeStatus enables its Meshy fallback only after your generator is unavailable or failed. Save and show the preview before an ambiguous redesign.', schema({ reviewId: string, referenceId: string, requestId: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,100}$' }, prompt: { type: 'string', maxLength: 4000 }, nativeStatus: { enum: ['unavailable','failed'] } }, ['requestId'])],
  ['concept_status', 'Read image generation job status and saved result IDs. Never resubmit a waiting job.', schema({})]
].map(([name, description, inputSchema]) => ({ name: 'dock/' + name, description, inputSchema }));
class Workbench {
  constructor(root, runtime, electron, { testMode, onChange, getSessions, getProject, getWindow, getHub, getAgents } = {}) {
    this.downloads = new ManagedDownloads(root); this.testMode = testMode;
    this.electron = electron; this.getSessions = getSessions; this.getProject = getProject; this.getWindow = getWindow;
    this.results = new Results(root, { trash: file => fs.promises.rm(file, { recursive: true, maxRetries: 2, retryDelay: 100 }), nativeImage: electron.nativeImage });
    this.alerts = new AlertEvents(); this.reviews = new Reviews(root, this.results, this.alerts, electron);
    this.concepts = new Concepts(root, runtime, this.results, this.reviews, this.alerts, { testMode, getSettings: () => getHub?.()?.config.imageGeneration, getKey: id => getHub().vault.get(id), authorizePreview: (job, balance) => getHub().authorizePreview(job, balance) });
    this.setup = new SetupRequests(root, { getHub, getAgents, onChange });
    for (const service of [this.results, this.concepts]) service.on('changed', onChange);
  }
  snapshot() { return { results: this.results.list(), unreadResults: this.results.unreadGroups(), concepts: this.concepts.list(), conceptUsage: this.concepts.usage, meshyAuth: this.concepts.auth, setupRequests: this.setup.items }; }
  tools() { return nativeTools; }
  async invoke(name, args, owner) {
    const session = owner ? this.getSessions().items.get(owner) || this.turns?.session(owner) : null;
    if (owner && !session?.alive) throw new Error('This console is no longer open.');
    const context = this.turns?.context(owner) || { project: session?.cwd || this.getProject(), projectId: session?.projectId || null, sessionId: session?.id || null, consoleKey: session?.consoleKey || session?.id || null, consoleName: session?.name || '' };
    switch (name) {
      case 'dock/downloaded_tools': return { items: this.downloads.list(), report: this.downloads.report };
      case 'dock/download_tool_repository': {
        if (this.testMode) throw Error('Repository downloads are disabled during tests.');
        return this.downloads.download(args);
      }
      case 'dock/website_guide': return websiteGuide(args.topic);
      case 'dock/project_progress': return this.projects.progress(session?.projectId, args);
      case 'dock/project_plan': return this.projects.plan(session?.projectId, args.section);
      case 'dock/propose_project_plan': {
        const p = this.projects.propose(session?.projectId, args, session?.name);
        this.alerts.send({ title: p.name + ': review ' + args.section, message: 'An agent proposal is ready in Projects → Roadmap.', kind: 'question', sessionId: session?.id, destination: 'projects' });
        return { projectId: p.id, revision: p.plan.revision, needsUserReview: true, section: args.section };
      }
      case 'dock/add_later_feature': { const p = this.projects.addLater(session?.projectId, args); return { revision: p.plan.revision, laterFeatures: p.plan.laterFeatures, files: p.plan.files }; }
      case 'dock/start_turn': return { turnId: await this.turns?.begin(owner), autoCapture: this.turns?.active.get(owner)?.capture === true };
      case 'dock/finish_turn': return { turnId: await this.turns?.finish(owner) || context.turnId || null };
      case 'dock/setup_status': return this.setup.status();
      case 'dock/prepare_setup': {
        const result = this.setup.prepare(args, context);
        this.alerts.send({ title: 'Setup ready: ' + (args.config.name || args.config.id || 'Screen previews'), message: result.message, kind: 'question', destination: 'tools' });
        return result;
      }
      case 'dock/save_result': return this.results.add(args, await resultGitContext(args, context, this.results.root));
      case 'dock/list_results': return this.results.list();
      case 'dock/notify': {
        const kind = args.kind || 'ready';
        args = { ...args, title: args.title || (kind === 'ready' ? 'Ready' : kind === 'question' ? 'Needs your input' : 'Needs attention') };
        const turnId = ['ready', 'error'].includes(kind) ? await this.turns?.finish(owner) || context.turnId : context.turnId;
        this.getSessions().signal?.(context.sessionId, kind);
        return this.alerts.send(completionNotice({ ...args, kind }, { ...context, turnId }, this.results.list()));
      }
      case 'dock/review_page': return { id: this.reviews.start({ ...args, ...context }) };
      case 'dock/review_details': { const review = this.reviews.get(args.id); return { ...review, screenshots: this.results.items.filter(x => (x.reviewId === review.id || x.groupId === review.id) && x.kind === 'screenshot').map(x => ({ id: x.id, title: x.title, file: this.results.path(x.id) })) }; }
      case 'dock/list_reviews': return this.reviews.list();
      case 'dock/review_check': this.reviews.check(args); return { id: args.id, check: this.reviews.get(args.id).checks[args.index] };
      case 'dock/delete_review': {
        if (this.reviews.active === args.id) throw new Error('Wait for this review to finish.');
        for (const job of this.concepts.items.filter(x => x.reviewId === args.id)) await this.concepts.remove(job.id);
        await this.reviews.remove(args.id); return { deleted: args.id };
      }
      case 'dock/meshy_concept': return { id: await this.concepts.start(args, { context }) };
      case 'dock/generate_preview': return this.concepts.generate(args, context);
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
      case 'results.preview': return this.results.preview(typeof payload === 'string' ? payload : payload?.id, payload?.thumbnail === true, payload?.entry);
      case 'results.delete': return this.results.remove(payload);
      case 'results.seen': return this.results.markSeen(payload);
      case 'results.folder': { const error = await this.electron.shell.openPath(this.results.dir); if (error) throw new Error(error); return; }
      case 'results.import': {
        const selected = await this.electron.dialog.showOpenDialog(this.getWindow(), { title: 'Add results', properties: ['openFile','multiSelections'], filters: [{ name: 'Results', extensions: ['png','jpg','jpeg','webp','txt','md','json','log','html','pdf','glb','gltf','obj','stl','zip'] }] });
        const imported = [], errors = [], groupId = randomUUID();
        for (const file of selected.filePaths.slice(0, 50)) { try { imported.push(this.results.add({ file, groupId, title: path.basename(file), source: 'Import', kind: /\.(png|jpe?g|webp)$/i.test(file) ? 'screenshot' : 'report' }, await resultGitContext({ file }, { project: this.getProject(), trusted: true }, this.results.root)).id); } catch (error) { errors.push(path.basename(file) + ': ' + error.message); } }
        return { imported, errors };
      }
      case 'results.export': {
        const source = this.results.path(payload), item = this.results.items.find(x => x.id === payload);
        const selected = await this.electron.dialog.showSaveDialog(this.getWindow(), { defaultPath: item.title.replace(/[<>:"/\\|?*]/g, '-') + item.ext });
        if (!selected.canceled && selected.filePath) fs.copyFileSync(source, selected.filePath);
        return;
      }
      case 'concept.auth-status': return this.concepts.authStatus();
      case 'concept.connect': return this.concepts.connect();
      case 'concept.open-login': {
        if (this.concepts.auth.state !== 'waiting') throw new Error('Start Meshy sign-in first.');
        return this.electron.shell.openExternal(this.concepts.auth.url);
      }
      case 'concept.resume': return this.concepts.resume(payload);
      case 'concept.delete': return this.concepts.remove(payload);
      default: throw new Error('Unknown workbench action.');
    }
  }
  stop() { this.reviews.stop(); this.concepts.stop(); }
}
module.exports = { Workbench };
