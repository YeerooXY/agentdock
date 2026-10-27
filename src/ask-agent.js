const languages = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', py: 'python', rb: 'ruby', rs: 'rust', sh: 'bash', ps1: 'powershell', yml: 'yaml', md: 'markdown', h: 'c', cpp: 'cpp', cs: 'csharp' };

export function formatAskContext({ note = '', file, from, to, text, folder, branch, side, stale = false }) {
  const extension = file.split('.').pop().toLowerCase();
  const lang = languages[extension] || (/^[a-z0-9]+$/.test(extension) && file.includes('.') ? extension : '');
  // Keep snippets containing Markdown fences inside a single code block.
  const fence = '`'.repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), m => m[0].length + 1)));
  const result = `${note.trim() ? note.trim() + '\n\n' : ''}File: ${file}:${from}-${to}  (${folder}${branch ? ` @ ${branch}` : ''}${side ? `, diff ${side} side` : ''})\n${stale ? 'Captured version: the file changed since selection.\n' : ''}${fence}${lang}\n${text}\n${fence}`;
  if (result.length > 60000) throw new Error('Select fewer than 60,000 characters.');
  return result;
}
