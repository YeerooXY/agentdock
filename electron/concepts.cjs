'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { atomicJson, readJson } = require('./storage.cjs');
const { inside } = require('./results.cjs');
class Concepts extends EventEmitter {
  constructor(root, runtime, results, reviews, inbox, { run, testMode = false } = {}) {
    super(); this.dir = path.join(root, 'concept-jobs'); fs.mkdirSync(this.dir, { recursive: true }); this.file = path.join(this.dir, 'index.json');
    this.items = readJson(this.file, []).map(x => ['submitting', 'waiting', 'downloading'].includes(x.state) ? { ...x, state: 'interrupted' } : x);
    this.usageFile = path.join(root, 'concept-usage.json'); this.usage = readJson(this.usageFile, []);
    this.auth = { state: 'unchecked' };
    this.runtime = runtime; this.results = results; this.reviews = reviews; this.inbox = inbox; this.children = new Set(); this.testMode = testMode; this.busy = false; this.stopping = false;
    this.run = run || ((args, timeout = 45000) => new Promise((resolve, reject) => {
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
      for (const key of Object.keys(env)) if (/API_KEY|SECRET|TOKEN|AGENT_DOCK_BRIDGE/i.test(key)) delete env[key];
      // Meshy owns its sign-in. Dock never reads or copies its credential file.
      const child = execFile(runtime.node, [runtime.meshyCli, ...args, '--format', 'json', '--no-update-check'], { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024, env }, (error, stdout) => {
        this.children.delete(child); let value; try { value = JSON.parse(stdout); } catch {}
        if (value?.result?.submission?.task_id || value?.result?.task?.task_id) return resolve(value);
        if (error || value?.ok === false) return reject(new Error('Meshy did not finish this step. Check your Meshy CLI sign-in, then resume the saved task.'));
        if (!value) return reject(new Error('Meshy returned no readable result.'));
        resolve(value);
      }); this.children.add(child);
    }));
  }
  list() { return this.items.map(({ prompt, ...x }) => x); }
  save() {
    atomicJson(this.file, this.items);
    for (const job of this.items.filter(x => x.taskId)) {
      const entry = { id: job.id, taskId: job.taskId, at: job.at, state: job.state, credits: job.credits };
      const index = this.usage.findIndex(x => x.id === job.id);
      if (index < 0) this.usage.unshift(entry); else this.usage[index] = entry;
    }
    atomicJson(this.usageFile, this.usage); this.emit('changed');
  }
  async authStatus() {
    if (this.testMode) throw new Error('Meshy account access is disabled during tests.');
    const value = await this.run(['auth', 'status']);
    this.auth = { state: value.authenticated && value.verified ? 'connected' : 'disconnected' }; this.emit('changed'); return this.auth;
  }
  async connect() {
    if (this.testMode) throw new Error('Meshy sign-in is disabled during tests.');
    if (this.auth.state === 'waiting' || this.auth.state === 'starting') return;
    this.auth = { state: 'starting' }; this.emit('changed');
    try {
      const flow = await this.run(['auth', 'login', '--device', '--no-wait']);
      const url = new URL(flow.verification_url);
      if (url.protocol !== 'https:' || !(url.hostname === 'meshy.ai' || url.hostname.endsWith('.meshy.ai')) || !/^[a-zA-Z0-9_-]+$/.test(flow.flow_id || '')) throw new Error('Meshy returned an invalid sign-in link.');
      this.auth = { state: 'waiting', code: String(flow.user_code || '').slice(0, 30), url: url.href }; this.emit('changed');
      // Only the CLI's local flow ID is passed back. Tokens and device secrets stay with the CLI.
      void this.run(['auth','login','--device-flow',flow.flow_id], Math.min(900000, Math.max(60000, (Number(flow.expires_in) || 600) * 1000 + 15000)))
        .then(value => { this.auth = { state: value.status === 'logged_in' ? 'connected' : 'disconnected' }; this.emit('changed'); })
        .catch(() => { this.auth = { state: 'disconnected', error: 'Sign-in ended. Try connecting again.' }; this.emit('changed'); });
    } catch (error) { this.auth = { state: 'disconnected', error: error.message }; this.emit('changed'); throw error; }
  }
  async start(raw) {
    if (this.testMode) throw new Error('Paid generation is disabled during tests.');
    if (this.busy) throw new Error('A concept is already running.');
    if (!['unavailable', 'failed'].includes(raw.nativeStatus)) throw new Error('Try the agent’s image generator first.');
    if (this.items.length >= 200) throw new Error('Delete an old concept job first.');
    const review = this.reviews.get(raw.reviewId);
    if (review.state !== 'complete') throw new Error('Finish the website review first.');
    const desktopId = review.report?.views?.find(x => x.name === 'Desktop')?.screenshot;
    const reference = this.results.items.find(x => x.id === desktopId) || this.results.items.find(x => (x.reviewId === review.id || x.groupId === review.id) && x.kind === 'screenshot');
    if (!reference) throw new Error('The reference screenshot was deleted. Run the review again.');
    const job = { id: crypto.randomUUID(), reviewId: review.id, turnId: review.turnId || '', referenceId: reference.id, sessionId: review.sessionId, consoleKey: review.consoleKey, consoleName: review.consoleName, project: review.project, state: 'submitting', at: Date.now(), taskId: null, credits: null,
      prompt: `Create one polished 2D website redesign concept using the reference screenshot. Keep the page’s purpose and real content. Improve hierarchy, spacing, typography and accessibility. Show a flat screen mockup, not a 3D scene. ${review.brief} ${String(raw.prompt || '').slice(0, 2000)}` };
    this.items.unshift(job); this.save(); this.launch(job, true); return job.id;
  }
  resume(id) {
    const job = this.items.find(x => x.id === id); if (!job || !job.taskId) throw new Error('No accepted task ID is available. Check Meshy before submitting anything again.');
    if (this.busy) throw new Error('A concept is already running.');
    if (this.testMode) throw new Error('Generation is disabled during tests.');
    this.launch(job, false);
  }
  launch(job, submit) {
    this.busy = true;
    this.perform(job, submit).catch(error => { job.state = this.stopping ? 'interrupted' : 'failed'; job.error = error.message; this.save(); if (!this.stopping) this.inbox.add({ title: 'Concept needs attention', message: error.message, reviewId: job.reviewId, kind: 'error' }); }).finally(() => { this.busy = false; });
  }
  async perform(job, submit) {
    if (!/^[a-f0-9-]{36}$/.test(job.id)) throw new Error('Invalid saved concept job.');
    const dir = path.join(this.dir, job.id); fs.mkdirSync(dir, { recursive: true });
    if (!inside(fs.realpathSync(this.dir), fs.realpathSync(dir)) || fs.lstatSync(dir).isSymbolicLink()) throw new Error('The concept folder was redirected.');
    const flags = ['--output-schema', 'v1', '--workspace', dir];
    if (submit) {
      // A copy inside the job boundary is the only reference uploaded.
      const source = this.results.path(job.referenceId), reference = path.join(dir, 'reference' + path.extname(source));
      fs.copyFileSync(source, reference, fs.constants.COPYFILE_EXCL);
      const submitted = await this.run(['image-to-image', 'create', '--ai-model', 'nano-banana-pro', '--prompt', job.prompt, '--reference-image-urls', reference, '--aspect-ratio', '16:9', '--async', '--operation-id', job.id, ...flags], 120000);
      job.taskId = submitted.result?.submission?.task_id || submitted.result?.task?.task_id;
      if (!job.taskId) throw new Error('No task ID returned. Check Meshy before generating again.');
      this.save();
    }
    job.state = 'waiting'; delete job.error; this.save();
    const completed = await this.run(['image-to-image', 'wait', job.taskId, '--timeout', '600', ...flags], 630000);
    const task = completed.result?.task;
    if (Number.isFinite(task?.consumed_credits)) job.credits = task.consumed_credits;
    this.save();
    if (task?.status !== 'SUCCEEDED') throw new Error('Meshy has not completed the image. Resume this task to check again.');
    const taskFile = path.join(dir, 'task.json'); atomicJson(taskFile, completed);
    job.state = 'downloading'; this.save();
    const listed = await this.run(['download', '--task-json', taskFile, '--list', ...flags]);
    const asset = listed.result?.assets?.find(x => x.kind === 'image');
    if (!asset) throw new Error('Meshy returned no image asset.');
    // A fresh directory allows resume after a partial download, without overwriting files.
    const output = path.join(dir, 'download-' + crypto.randomUUID());
    const downloaded = await this.run(['download', '--task-json', taskFile, '--asset', asset.key, '--output-dir', output, ...flags], 120000);
    const file = downloaded.result?.downloads?.files?.find(x => x.status === 'written')?.path;
    if (!file || !inside(fs.realpathSync(dir), fs.realpathSync(file))) throw new Error('Meshy did not save an image inside the job folder.');
    const saved = this.results.add({ file, title: 'Page concept · Meshy', kind: 'concept', source: 'Meshy', groupId: job.reviewId, reviewId: job.reviewId, summary: job.prompt }, { project: job.project, sessionId: job.sessionId, consoleKey: job.consoleKey, consoleName: job.consoleName, turnId: job.turnId, trusted: true });
    job.resultId = saved.id; job.state = 'complete'; this.save();
    this.inbox.add({ title: 'Page concept ready', resultId: saved.id, reviewId: job.reviewId });
    // Keep task/credit metadata; discard duplicate working files only within this proven job folder.
    try { await this.cleanFiles(job.id); } catch { job.cleanupWarning = 'Temporary files remain. Use Remove job to clean them up.'; this.save(); }
  }
  async cleanFiles(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Unknown job.');
    const dir = path.join(this.dir, id);
    if (!fs.existsSync(dir)) return;
    if (!inside(fs.realpathSync(this.dir), fs.realpathSync(dir)) || fs.lstatSync(dir).isSymbolicLink()) throw new Error('The concept folder was redirected.');
    // The app's own temporary downloads can be recycled with the gallery files.
    await this.results.trash(dir);
  }
  async remove(id) {
    const job = this.items.find(x => x.id === id); if (!job) return;
    if (this.busy && ['submitting', 'waiting', 'downloading'].includes(job.state)) throw new Error('Wait for the concept to finish.');
    await this.cleanFiles(id); this.items = this.items.filter(x => x.id !== id); this.save();
  }
  stop() { this.stopping = true; for (const child of this.children) child.kill(); }
}
module.exports = { Concepts };
