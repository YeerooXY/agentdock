const languages = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', py: 'python', rb: 'ruby', rs: 'rust', sh: 'bash', ps1: 'powershell', yml: 'yaml', md: 'markdown', h: 'c', cpp: 'cpp', cs: 'csharp' };

export function askSelectionChanged(currentText, { from, to, text }) {
  if (typeof currentText !== 'string') return true;
  const normalize = value => value.replace(/\r\n?/g, '\n');
  const lines = normalize(currentText).split('\n');
  return from < 1 || to < from || to > lines.length || lines.slice(from - 1, to).join('\n') !== normalize(text);
}

export function defaultAskTarget(list, { rememberedId, sourceKey, cwd, platform } = {}) {
  const key = value => {
    const path = (value || '').replaceAll('\\', '/').replace(/\/$/, '');
    return platform === 'win32' ? path.toLowerCase() : path;
  };
  return list.find(x => x.id === rememberedId)
    || (sourceKey && list.find(x => (x.consoleKey || x.id) === sourceKey))
    || (cwd && list.find(x => key(x.cwd) === key(cwd)))
    || list[0];
}

export function formatAskContext({ note = '', file, from, to, text, folder, branch, side, stale = false }) {
  const extension = file.split('.').pop().toLowerCase();
  const lang = languages[extension] || (/^[a-z0-9]+$/.test(extension) && file.includes('.') ? extension : '');
  // Keep snippets containing Markdown fences inside a single code block.
  const fence = '`'.repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), m => m[0].length + 1)));
  const result = `${note.trim() ? note.trim() + '\n\n' : ''}File: ${file}:${from}-${to}  (${folder}${branch ? ` @ ${branch}` : ''}${side ? `, diff ${side} side` : ''})\n${stale ? 'Captured version: the file changed since selection.\n' : ''}${fence}${lang}\n${text}\n${fence}`;
  if (result.length > 60000) throw new Error('Select fewer than 60,000 characters.');
  return result;
}
