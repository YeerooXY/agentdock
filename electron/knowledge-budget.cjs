'use strict';
const { readJson, atomicJson } = require('./storage.cjs');
const WINDOW = 3600000, LIMIT = 4;
class KnowledgeBudget {
  constructor(file, now = Date.now) {
    this.file = file; this.now = now; this.projects = Object.create(null);
    const saved = readJson(file, { projects: {} });
    if (saved.legacy !== undefined) {
      if (!Array.isArray(saved.legacy) || saved.legacy.some(at => !Number.isFinite(at))) throw Error('Documentation budget history is invalid.');
      this.legacy = saved.legacy;
    }
    if (saved.projects && typeof saved.projects === 'object' && !Array.isArray(saved.projects)) {
      for (const [id, starts] of Object.entries(saved.projects)) {
        if (!Array.isArray(starts) || starts.some(at => !Number.isFinite(at))) throw Error('Documentation budget history is invalid.');
        this.projects[id] = starts;
      }
    } else if (Array.isArray(saved.starts) && saved.starts.every(Number.isFinite)) {
      // Old entries have no project attribution. Retain them for this hour only.
      this.legacy = saved.starts;
    } else throw Error('Documentation budget history is invalid.');
  }
  starts(id) { return [...(this.legacy || []), ...(this.projects[id] || [])].filter(at => at > this.now() - WINDOW); }
  available(id) { return this.starts(id).length < LIMIT; }
  record(id) {
    if (!this.available(id)) throw Error('This project reached four documentation attempts this hour.');
    for (const key of Object.keys(this.projects)) this.projects[key] = this.projects[key].filter(at => at > this.now() - WINDOW);
    this.projects[id] ||= []; this.projects[id].push(this.now());
    const legacy = (this.legacy || []).filter(at => at > this.now() - WINDOW);
    atomicJson(this.file, { projects: this.projects, ...(legacy.length ? { legacy } : {}) });
  }
}
module.exports = { KnowledgeBudget };
