'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { atomicJson, readJson } = require('./storage.cjs');

const MAX_PROMPTS = 200, MAX_NAME = 60, MAX_TEXT = 16000;

// Named prompts the user reuses. A prompt can belong to one project; prompts
// without a project are offered in every console.
class PromptLibrary extends EventEmitter {
  constructor(root) {
    super();
    this.file = path.join(root, 'prompts.json');
    const saved = readJson(this.file, { prompts: [] });
    this.items = (Array.isArray(saved?.prompts) ? saved.prompts : []).map(x => { try { return clean(x); } catch { return null; } }).filter(Boolean);
  }
  list() { return this.items.map(x => ({ ...x })); }
  save(raw) {
    const prompt = clean({ ...raw, id: raw?.id || crypto.randomUUID(), updatedAt: Date.now() });
    const index = this.items.findIndex(x => x.id === prompt.id);
    if (raw?.id && index < 0) throw new Error('This saved prompt was removed.');
    if (index < 0 && this.items.length >= MAX_PROMPTS) throw new Error(`You can save up to ${MAX_PROMPTS} prompts.`);
    const items = index < 0 ? [...this.items, prompt] : this.items.map((x, i) => i === index ? prompt : x);
    atomicJson(this.file, { prompts: items }); this.items = items; this.emit('changed');
    return { ...prompt };
  }
  remove(id) {
    if (!this.items.some(x => x.id === id)) throw new Error('This saved prompt was already removed.');
    const items = this.items.filter(x => x.id !== id);
    atomicJson(this.file, { prompts: items }); this.items = items; this.emit('changed');
  }
}

function clean(raw) {
  const name = typeof raw?.name === 'string' ? raw.name.trim() : '', text = typeof raw?.text === 'string' ? raw.text.replace(/\r\n?/g, '\n') : '';
  if (!name) throw new Error('Name the prompt.');
  if (name.length > MAX_NAME) throw new Error(`Prompt names can be up to ${MAX_NAME} characters.`);
  if (!text.trim()) throw new Error('Type the prompt text.');
  if (text.length > MAX_TEXT) throw new Error(`Prompts can be up to ${MAX_TEXT} characters.`);
  if (typeof raw.id !== 'string' || !/^[\w-]{1,64}$/.test(raw.id)) throw new Error('Invalid prompt.');
  const projectId = typeof raw.projectId === 'string' && /^[\w-]{1,64}$/.test(raw.projectId) ? raw.projectId : null;
  return { id: raw.id, name, text, projectId, updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now() };
}

module.exports = { PromptLibrary, MAX_PROMPTS };
