import openai from '../mobile/assets/providers/openai.png';
import cursor from '../mobile/assets/providers/cursor.png';
import opencode from '../mobile/assets/providers/opencode.png';
import cline from '../mobile/assets/providers/cline.png';
import claude from '../mobile/assets/providers/claude.png';
import gemini from '../mobile/assets/providers/gemini.png';
import antigravity from '../mobile/assets/providers/antigravity.png';
import kiro from '../mobile/assets/providers/kiro.png';
import droid from '../mobile/assets/providers/droid.png';
import pi from '../mobile/assets/providers/pi.png';
import zai from '../mobile/assets/providers/zai.png';
import ollama from '../mobile/assets/providers/ollama.png';

// Local assets only. Unknown/restricted logos use a plain initial and name.
// See docs/provider-brand-assets.md for sources and permission boundaries.
const identities = {
  codex: ['Codex', '#9cbfff', openai],
  openai: ['OpenAI', '#9cbfff', openai],
  claude: ['Claude', '#e6a187', claude],
  anthropic: ['Claude', '#e6a187', claude],
  gemini: ['Gemini', '#8aafff', gemini],
  antigravity: ['Antigravity', '#90bdff', antigravity],
  copilot: ['Copilot', '#bb9aff'],
  opencode: ['OpenCode', '#c9c8c5', opencode],
  cursor: ['Cursor', '#e4e4e4', cursor],
  grok: ['Grok', '#dedee5'],
  kiro: ['Kiro', '#c398ff', kiro],
  qwen: ['Qwen', '#a59aff'],
  kimi: ['Kimi', '#91a7ff'],
  cline: ['Cline', '#c8c8d0', cline],
  droid: ['Droid', '#ffa684', droid],
  pi: ['Pi', '#ffb08b', pi],
  zai: ['Z.AI', '#b9c1ff', zai],
  ollama: ['Ollama', '#e4e4e4', ollama],
  deepseek: ['DeepSeek', '#8aafff'],
};
identities['z.ai'] = identities.zai;
identities.alibaba = identities.qwen;
identities.moonshot = identities.kimi;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
export function accountIdentity(provider) {
  const key = String(provider).toLowerCase();
  const [name, color, logo] = Object.hasOwn(identities, key) ? identities[key] : [String(provider || 'Account'), '#b5bbd0'];
  return { name, color, logo };
}
export function accountMark(provider) {
  const { name, color, logo } = accountIdentity(provider);
  return `<span class="account-mark" aria-hidden="true" style="--provider-accent:${color}">${logo ? `<img src="${logo}" alt="" width="28" height="28">` : escape(name.slice(0, 1))}</span>`;
}
export function remainingPercent(used) {
  return typeof used === 'number' && Number.isFinite(used) && used >= 0 && used <= 100 ? 100 - used : null;
}
