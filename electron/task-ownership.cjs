'use strict';
// Globs deliberately have a small, explicit grammar. Both validation and the
// ownership guard use this matcher, including **/, character classes and braces.
function globRegex(pattern) {
  let source = '', braces = 0;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') { i++; if (pattern[i + 1] === '/') { i++; source += '(?:.*/)?'; } else source += '.*'; }
      else source += '[^/]*';
    } else if (c === '?') source += '[^/]';
    else if (c === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end < 0 || end === i + 1) throw new Error('Unclosed or empty character class.');
      const value = pattern.slice(i + 1, end);
      if (value.includes('/') || value.includes('[') || value.includes('\\')) throw new Error('Invalid character class.');
      source += `(?!/)[${value.startsWith('!') ? '^' + value.slice(1) : value}]`; i = end;
    } else if (c === '{') { braces++; source += '(?:'; }
    else if (c === '}') { if (!braces--) throw new Error('Unmatched brace.'); source += ')'; }
    else if (c === ',' && braces) source += '|';
    else source += c.replace(/[.+^$()|\\\]]/g, '\\$&');
  }
  if (braces) throw new Error('Unclosed brace.');
  return new RegExp(`^${source}$`, 'i');
}
function validGlob(value) {
  if (typeof value !== 'string' || !value || value.length > 500 || value.includes('..') || /[\x00-\x1f\\:]/.test(value) || value.startsWith('/') || value.startsWith('-') || value.startsWith('!') || value.split('/').some(part => !part || part === '.' || part.toLowerCase() === '.git')) return false;
  try { globRegex(value); return true; } catch { return false; }
}
function ownsFile(subtask, file) { return subtask.owns.some(pattern => globRegex(pattern).test(file.replaceAll('\\', '/'))); }
function overlap(a, b) {
  const prefix = value => value.split(/[*?[{]/, 1)[0].toLowerCase();
  const left = prefix(a), right = prefix(b);
  return left.startsWith(right) || right.startsWith(left);
}

module.exports = { validGlob, ownsFile, overlap };
