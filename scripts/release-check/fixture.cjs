'use strict';
// In-memory IPC only. Never import main-process services or execute a real tool.
const image = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600"><rect width="2400" height="1600" fill="#17334b"/><text x="120" y="240" fill="white" font-size="90">Synthetic review image</text></svg>').toString('base64');
async function installBridge(context, state, record, origin) {
  const f = state._fixture;
  if (f.screenshot) state.screenshot = { name: 'review.png', at: Date.now(), thumb: image };
  await context.exposeFunction('fixtureCall', async (method, payload) => {
    record.calls.push(method);
    const ok = value => ({ ok: true, value });
    const changed = value => ({ ok: true, value, state });
    const fail = error => ({ ok: false, error });
    switch (method) {
      case 'state': return ok(state);
      case 'session.buffer': return ok({ data: f.fileKind ? 'C:\\Workspace\\review.md\r\n' : 'Synthetic console output\r\n', sequence: 0, launchId: state.sessions.find(x => x.id === payload)?.launchId });
      case 'session.models': return ok([]);
      case 'session.resize': case 'session.input': case 'session.acknowledge': case 'clipboard.write': return ok(null);
      case 'settings': Object.assign(state.settings, payload); return changed(state.settings);
      case 'mode': state.mode = payload; return changed(payload);
      // Only validate the synthetic folder/console choice. No filesystem or install work runs.
      case 'setup.validate': return ok({ ...payload });
      case 'setup.complete': state.settings.setupComplete = true; return changed(state);
      case 'mobile.status': case 'mobile.check-firewall': return ok(state.mobile);
      case 'mobile.cancel-pairing': return ok(null);
      case 'session.layout.preview': {
        const plan = state.sessions.map(x => ({ id: x.id, slot: x.slot, width: x.width, height: x.height }));
        const moved = plan.find(x => x.id === payload.id), occupied = plan.find(x => x.slot === payload.slot && x.id !== payload.id);
        if (occupied) occupied.slot = moved.slot;
        Object.assign(moved, payload);
        return ok(plan);
      }
      case 'session.layout': Object.assign(state.sessions.find(x => x.id === payload.id), payload); return changed(state.sessions);
      case 'session.move': {
        const moved = state.sessions.find(x => x.id === payload.id), occupied = state.sessions.find(x => x.slot === payload.slot);
        if (occupied) occupied.slot = moved.slot;
        moved.slot = payload.slot;
        return changed(moved);
      }
      case 'queue.move': case 'queue.remove': case 'queue.edit': case 'queue.add': case 'queue.pause': {
        const queue = state.queues[payload.id] ||= { paused: false, entries: [] };
        const i = queue.entries.findIndex(x => x.id === payload.entryId);
        if (method === 'queue.move') { const [entry] = queue.entries.splice(i, 1); queue.entries.splice(i + payload.offset, 0, entry); }
        if (method === 'queue.remove') queue.entries.splice(i, 1);
        if (method === 'queue.edit') queue.entries[i].text = payload.text;
        if (method === 'queue.add') queue.entries.push({ id: `added-${queue.entries.length}`, text: payload.text, createdAt: Date.now() });
        if (method === 'queue.pause') queue.paused = payload.paused;
        return changed(queue);
      }
      case 'code.create': case 'web.create': {
        const panel = { id: method === 'code.create' ? 'code-one' : 'web-one', kind: method === 'code.create' ? 'code' : 'web', alive: true, state: 'open', slot: 3, width: 1, height: 1, name: 'Review panel', cwd: 'C:\\Workspace', codeSourceKey: 'console-0', url: f.webUrl?.startsWith('/') ? origin + f.webUrl : f.webUrl || '' };
        state.codePanels.push(panel); return changed(panel);
      }
      case 'code.report': return ok(f.report);
      case 'code.file': return ok({ file: payload.path, before: payload.reportId ? 'export function greeting() { return "Hello"; }\n' : null, after: f.changedCode ? 'File changed after selection.\n' : f.codeText, mode: payload.reportId ? 'turn' : 'file' });
      case 'code.browse': return ok({ path: payload.path || '', items: [{ name: 'greeting.js', path: 'src/greeting.js' }] });
      case 'explorer.list': return ok(payload.path ? { path: payload.path, entries: [{ name: 'greeting.js', path: `${payload.path}/greeting.js` }], truncated: false } : { path: '', entries: [{ name: 'src', path: 'src', directory: true }, { name: 'README.md', path: 'README.md' }], truncated: false });
      case 'file.preview': return f.fileKind === 'missing' ? fail('File not found. Check the path.') : ok({ name: 'review.md', path: 'C:\\Workspace\\review.md', kind: f.fileKind, size: f.fileKind === 'large' ? 100000000 : 1024, text: '# Review file\n\nSynthetic preview content.\n', data: image });
      case 'ssh.scan': return f.sshError ? fail(f.sshError) : ok({ probeId: 'review-probe', fingerprint: 'SHA256:synthetic-review-fingerprint', algorithm: 'ssh-ed25519', changed: !!f.sshChanged });
      case 'slot.trim': {
        if (payload.style === 'default') delete state.settings.slotTrims[payload.slot];
        else state.settings.slotTrims[payload.slot] = payload.style;
        return changed(state.settings);
      }
      case 'projects.plan.thumb': return ok(image);
      case 'workbench.results.preview': {
        if (f.resultError) return fail(f.resultError);
        const entry = state.workbench.results.find(x => x.id === (payload.id || payload));
        if (!entry) return fail('Synthetic result not found.');
        if (entry.image) return ok({ image });
        if (entry.kind === 'code') return ok({ diff: f.report });
        if (entry.ext === '.zip') return ok({ archive: { entries: [{ index: 0, name: 'report.md', ext: '.md' }] }, entry: { index: 0, name: 'report.md', ext: '.md' }, text: '# Archived review\n\nSynthetic report.' });
        return ok({ text: f.resultText || '# Review report\n\nSynthetic saved result.' });
      }
      case 'workbench.results.seen': for (const entry of state.workbench.results) if (payload.includes(entry.id)) entry.seenAt ||= Date.now(); return ok(null);
      default:
        // A missing mock must never look like a successful backend operation.
        record.unsupportedCalls.push(method);
        return fail(`Release fixture does not implement ${method}`);
    }
  });
  await context.addInitScript(() => {
    let receive;
    window.dock = {
      call: async (method, payload) => { const reply = await window.fixtureCall(method, payload); if (reply.state) receive?.(reply.state); return reply; },
      onState: fn => { receive = fn; window.fixtureState = fn; },
      onOutput: fn => { window.fixtureOutput = fn; },
      onSelect: fn => { window.fixtureSelect = fn; },
      onNotice: fn => { window.fixtureNotice = fn; }
    };
  });
}
module.exports = { installBridge };
