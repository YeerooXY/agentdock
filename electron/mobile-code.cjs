'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { CodePanel } = require('./code-panel.cjs');

class MobileCode {
  constructor(sessions, panel) {
    this.sessions = sessions;
    this.panel = panel || new CodePanel(sessions, { getProjects: () => sessions.projects?.list() || [] });
  }
  roots(session) {
    if (!session || session.dismissed || session.remote || session.remoteHostId || session.kind) throw new Error('Choose a local console.');
    const project = this.sessions.projects?.list().find(p => p.id === session.projectId && p.status !== 'archived');
    const roots = project?.folders?.length ? project.folders.map(f => f.path) : [session.cwd];
    return [...new Set(roots.map(root => this.panel.explorerRoot(root)))];
  }
  location(roots, value) {
    if (typeof value !== 'string' || value.includes('\0') || value.split(/[\\/]/).includes('..')) throw new Error('Choose a file inside this project.');
    const target = path.resolve(roots[0], value);
    const root = [...roots].sort((a, b) => b.length - a.length).find(root => {
      const relative = path.relative(root, target);
      return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
    });
    if (!root) throw new Error('Choose a file inside this project.');
    return { root, relative: path.relative(root, target).replaceAll('\\', '/') };
  }
  async call(method, session, value = '') {
    const roots = this.roots(session);
    if (method === 'code.list' && value === '' && roots.length > 1) return {
      path: '', parent: null, breadcrumbs: [], truncated: roots.length > 500,
      entries: roots.slice(0, 500).map(root => ({ name: root, path: root, directory: true })),
    };
    const { root, relative } = this.location(roots, value);
    if (method === 'code.list') {
      const result = await this.panel.list(root, relative);
      const parts = relative.split('/').filter(Boolean);
      return { ...result, path: path.join(root, relative), parent: relative ? path.dirname(path.join(root, relative)) : roots.length > 1 ? '' : null,
        breadcrumbs: [{ name: path.basename(root) || root, path: root }, ...parts.map((name, i) => ({ name, path: path.join(root, ...parts.slice(0, i + 1)) }))],
        entries: result.entries.map(entry => ({ ...entry, path: path.join(root, entry.path) })) };
    }
    const result = { path: relative, folder: root, text: null, omitted: null, size: null, lines: 0 };
    try {
      const panel = { cwd: root, codeSourceKey: null };
      const { target } = await this.panel.resolve(panel, relative);
      result.size = (await fs.stat(target)).size;
      result.text = await this.panel.read(panel, relative);
      result.lines = result.text.replace(/\r\n?/g, '\n').split('\n').length;
    } catch (error) {
      // Invalid locations are rejected; preview exclusions return a visible reason.
      if (!/excluded|256 KB|no code preview/.test(error.message)) throw error;
      result.omitted = error.message;
    }
    return result;
  }
}
module.exports = { MobileCode };
