// Shared text formatting for desktop pages and console panels.
import { escapeHtml as escape } from '../html-escape.js';

export const number = value => Number.isFinite(value) ? Intl.NumberFormat('en', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value) : '—';
export const statusLabels = { open: 'Open', active: 'Thinking', ready: 'Ready', attention: 'Needs attention', error: 'Error', ended: 'Ended', recent: 'Recent', interrupted: 'Interrupted' };
export function age(at) {
  if (!at) return 'Not connected';
  const minutes = Math.max(0, Math.floor((Date.now() - at) / 60000));
  return minutes < 1 ? 'Just updated' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}
export function windowLabel(minutes) { return minutes === 10080 ? 'Weekly' : minutes === 300 ? '5-hour' : minutes == null ? 'Usage window' : minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60}-hour` : `${minutes} min`; }
export function badge(status) { return `<span class="status ${escape(status)}"><span class="dot"></span>${escape(statusLabels[status] || status)}</span>`; }
export function pageHeading(eyebrow, title, description, action = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}
