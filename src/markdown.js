import { Marked } from 'marked';
import DOMPurify from 'dompurify';

const escape = value => String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const markdown = new Marked({ gfm: true, renderer: {
  html: ({ text }) => escape(text),
  // Reports must not make network requests simply because someone previews them.
  // Task lists are read-only here; a labelled mark reads better than a disabled, unlabelled checkbox.
  checkbox: ({ checked }) => `<span class="markdown-task" role="img" aria-label="${checked ? 'Done' : 'Not done'}">${checked ? '☑' : '☐'}</span> `,
  image: ({ text }) => `<span class="markdown-image">Image: ${escape(text || 'see saved images in Results')}</span>`,
  link({ href, tokens }) {
    const label = this.parser.parseInline(tokens);
    try {
      const url = new URL(href);
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return `<a href="${escape(url.href)}" rel="noopener noreferrer">${label}</a>`;
    } catch {}
    return `<span title="${escape(href)}">${label}</span>`;
  },
} });

export function renderMarkdown(text) {
  return DOMPurify.sanitize(markdown.parse(String(text || '')), {
    ALLOWED_TAGS: ['p','br','hr','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','em','del','blockquote','pre','code','table','thead','tbody','tr','th','td','a','span','input'],
    ALLOWED_ATTR: ['href','title','rel','class','start','align','type','disabled','checked','role','aria-label'],
    ALLOW_DATA_ATTR: false,
  });
}
