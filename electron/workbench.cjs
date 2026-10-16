'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Results, Inbox } = require('./results.cjs');
const { Reviews } = require('./reviews.cjs');
const { Concepts } = require('./concepts.cjs');
const { SetupRequests } = require('./setup-requests.cjs');
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string' };
const nativeTools = [
  ['setup_status', 'Inspect installed agents, saved key names and shared tool/API settings. Never returns key values.', schema({})],
  ['prepare_setup', 'Prepare a tool connection, model API or key-entry request in Tools. The user reviews and applies it there. config uses the Tools form fields: tool {id,name,type,command,args,envKeys} or {id,name,type,url,headerKeys}; API {id,name,protocol,url,keyId}; key {id,name}. Key bindings use vault IDs, never secret values. Does not install software, send API requests or change an active connection.', schema({ kind: { enum: ['tool','api','key'] }, config: { type: 'object' } }, ['kind','config'])],
  ['save_result', 'Save a screenshot, generated image, test report or other result in the gallery. Files must be inside your project folder. The gallery keeps a copy.', schema({ file: string, text: string, title: string, kind: { enum: ['screenshot','concept','test','report','asset'] }, status: { enum: ['passed','failed','needs-review'] }, summary: string, groupId: string, ext: { enum: ['.md','.json','.txt'] } }, ['title'])],
  ['list_results', 'List saved results, newest first.', schema({})],
  ['notify', 'Leave a short completion, question or error in the attention inbox.', schema({ title: string, message: string, kind: { enum: ['ready','question','error'] } }, ['title'])],
  ['review_page', 'Start a website review: desktop/mobile screenshots, axe accessibility checks and a manual checklist. Returns a job ID; read review_details later.', schema({ url: string, brief: string }, ['url'])],
  ['review_details', 'Get a website review, findings, checklist and reference screenshot paths.', schema({ id: string }, ['id'])],
  ['meshy_concept', 'Fallback only: generate a 2D page concept with Meshy after your own image generator is unavailable or has failed. Uploads the reference screenshot to Meshy and uses credits. Requires Meshy CLI sign-in.', schema({ reviewId: string, nativeStatus: { enum: ['unavailable','failed'] }, prompt: string }, ['reviewId','nativeStatus'])],
  ['concept_status', 'Read Meshy concept job status and saved result IDs. Never resubmit a waiting job.', schema({})]
].map(([name, description, inputSchema]) => ({ name: 'dock/' + name, description, inputSchema }));
class Workbench {
  constructor(root, runtime, electron, { testMode, onChange, getSessions, getProject, getWindow, getHub, getAgents } = {}) {
    this.electron = electron; this.getSessions = getSessions; this.getProject = getProject; this.getWindow = getWindow;
    this.results = new Results(root, { trash: file => electron.shell.trashItem(file), nativeImage: electron.nativeImage });
    this.inbox = new Inbox(root); this.reviews = new Reviews(root, this.results, this.inbox, electron);
    this.concepts = new Concepts(root, runtime, this.results, this.reviews, this.inbox, { testMode });
    this.setup = new SetupRequests(root, { getHub, getAgents, onChange });
    for (const service of [this.results, this.inbox, this.reviews, this.concepts]) service.on('changed', onChange);
  }
  snapshot() { return { results: this.results.list(), unreadResults: this.results.unreadGroups(), inbox: this.inbox.items, reviews: this.reviews.list(), concepts: this.concepts.list(), conceptUsage: this.concepts.usage, meshyAuth: this.concepts.auth, setupRequests: this.setup.items }; }
  tools() { return nativeTools; }
  async invoke(name, args, owner) {
    const session = owner ? this.getSessions().items.get(owner) : null;
    if (owner && !session?.alive) throw new Error('This console is no longer open.');
    const context = { project: session?.cwd || this.getProject(), sessionId: session?.id || null, consoleKey: session?.consoleKey || session?.id || null, consoleName: session?.name || '' };
    switch (name) {
      case 'dock/setup_status': return this.setup.status();
      case 'dock/prepare_setup': {
        const result = this.setup.prepare(args, context);
        this.inbox.add({ title: 'Setup ready: ' + (args.config.name || args.config.id), message: result.message, kind: 'question', destination: 'tools' });
        return result;
      }
      case 'dock/save_result': return this.results.add(args, context);
      case 'dock/list_results': return this.results.list();
      case 'dock/notify': this.getSessions().signal?.(context.sessionId, args.kind); return this.inbox.add({ ...args, sessionId: context.sessionId });
      case 'dock/review_page': return { id: this.reviews.start({ ...args, ...context }) };
      case 'dock/review_details': { const review = this.reviews.get(args.id); return { ...review, screenshots: this.results.items.filter(x => x.groupId === review.id && x.kind === 'screenshot').map(x => ({ id: x.id, title: x.title, file: this.results.path(x.id) })) }; }
      case 'dock/meshy_concept': return { id: await this.concepts.start(args) };
      case 'dock/concept_status': return this.concepts.list();
      default: throw new Error('Unknown Dock tool.');
    }
  }
  async call(method, payload) {
    switch (method) {
      case 'setup.apply': return this.setup.apply(payload);
      case 'setup.dismiss': return this.setup.remove(payload);
      case 'results.preview': return this.results.preview(typeof payload === 'string' ? payload : payload?.id, payload?.thumbnail === true);
      case 'results.delete': return this.results.remove(payload);
      case 'results.seen': return this.results.markSeen(payload);
      case 'results.folder': { const error = await this.electron.shell.openPath(this.results.dir); if (error) throw new Error(error); return; }
      case 'results.import': {
        const selected = await this.electron.dialog.showOpenDialog(this.getWindow(), { title: 'Add results', properties: ['openFile','multiSelections'], filters: [{ name: 'Results', extensions: ['png','jpg','jpeg','webp','txt','md','json','log','html','pdf','glb','gltf','obj','stl','zip'] }] });
        const imported = [], errors = [], groupId = randomUUID();
        for (const file of selected.filePaths.slice(0, 50)) { try { imported.push(this.results.add({ file, groupId, title: path.basename(file), source: 'Import', kind: /\.(png|jpe?g|webp)$/i.test(file) ? 'screenshot' : 'report' }, { project: this.getProject(), trusted: true }).id); } catch (error) { errors.push(path.basename(file) + ': ' + error.message); } }
        return { imported, errors };
      }
      case 'results.export': {
        const source = this.results.path(payload), item = this.results.items.find(x => x.id === payload);
        const selected = await this.electron.dialog.showSaveDialog(this.getWindow(), { defaultPath: item.title.replace(/[<>:"/\\|?*]/g, '-') + item.ext });
        if (!selected.canceled && selected.filePath) fs.copyFileSync(source, selected.filePath);
        return;
      }
      case 'inbox.update': return this.inbox.update(payload);
      case 'review.start': return this.reviews.start({ ...payload, project: payload.project || this.getProject() });
      case 'review.get': return this.reviews.get(payload);
      case 'review.check': return this.reviews.check(payload);
      case 'review.delete': {
        for (const job of this.concepts.items.filter(x => x.reviewId === payload)) await this.concepts.remove(job.id);
        return this.reviews.remove(payload);
      }
      case 'review.brief': { const brief = this.reviews.brief(payload); this.electron.clipboard.writeText(brief); return brief; }
      case 'review.draft': {
        const session = this.getSessions().items.get(payload.sessionId);
        if (!session?.alive || !['codex','claude'].includes(session.provider) || !['open','ready'].includes(session.state)) throw new Error('Choose an idle Codex or Claude console.');
        // Paste a draft only. The user can inspect it before pressing Enter.
        const brief = this.reviews.brief(payload.id).replaceAll('\x1b', '');
        this.getSessions().write(session.id, '\x1b[200~' + brief + '\x1b[201~', { draft: true });
        return session.id;
      }
      case 'concept.start': return this.concepts.start(payload);
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
