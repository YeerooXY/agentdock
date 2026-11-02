// Escapes text for HTML content and quoted attributes.
// 0 and false render as text; null and undefined render as nothing.
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => entities[char]);
