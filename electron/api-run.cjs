'use strict';
const crypto = require('node:crypto');
const { validateRequest, normalizeUsage, estimateCost } = require('./domain.cjs');
const { endpoint } = require('./shared.cjs');
const { DOCK_TOOLS, textResult } = require('./tool-contract.cjs');
function toolContent(result, protocol) {
  return (result.content || []).flatMap(item => {
    if (item.type === 'text') return [{ type: protocol === 'responses' ? 'input_text' : 'text', text: item.text }];
    if (item.type === 'image' && /^image\/(png|jpeg|gif|webp)$/.test(item.mimeType)) return [protocol === 'responses' ? { type: 'input_image', image_url: `data:${item.mimeType};base64,${item.data}` } : { type: 'image', source: { type: 'base64', media_type: item.mimeType, data: item.data } }];
    return [{ type: protocol === 'responses' ? 'input_text' : 'text', text: JSON.stringify(item) }];
  });
}
async function runApi(raw, key, rates, { profile, hub, fetcher = fetch, onEntry = () => {} } = {}) {
  const request = validateRequest({ ...raw, provider: profile.protocol === 'anthropic' ? 'anthropic' : 'openai' });
  const { model, prompt, maxOutput } = request, protocol = profile.protocol;
  endpoint(profile.url);
  const instructions = hub?.summary();
  const tools = hub ? DOCK_TOOLS.map(t => protocol === 'responses' ? { type: 'function', name: t.name, description: t.description, parameters: t.inputSchema, strict: false } : protocol === 'anthropic' ? { name: t.name, description: t.description, input_schema: t.inputSchema } : { type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }) : [];
  const messages = [{ role: 'user', content: prompt }];
  if (instructions && protocol === 'chat') messages.unshift({ role: 'system', content: instructions });
  const input = [{ role: 'user', content: prompt }];
  const entries = []; let lastText = '';
  const finish = async (entry, extra = {}) => { entries.push(entry); await onEntry(entry); return { entry, entries, text: lastText, ...extra }; };
  for (let round = 0; round < 8; round++) {
    const entry = { id: crypto.randomUUID(), at: Date.now(), provider: profile.id, model, usage: null, estimatedCost: null, status: 'failed' };
    const headers = protocol === 'anthropic' ? { ...(key ? { 'x-api-key': key } : {}), 'anthropic-version': '2023-06-01' } : key ? { Authorization: `Bearer ${key}` } : {};
    const body = protocol === 'responses' ? { model, input, max_output_tokens: maxOutput, store: false, ...(instructions ? { instructions } : {}) } : protocol === 'anthropic' ? { model, messages, max_tokens: maxOutput, ...(instructions ? { system: instructions } : {}) } : { model, messages, max_tokens: maxOutput };
    if (tools.length) body.tools = tools;
    let data;
    try {
      const response = await fetcher(profile.url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(180000) });
      if (!response.ok) return finish({ ...entry, httpStatus: response.status, durationMs: Date.now() - entry.at }, { error: `Provider returned HTTP ${response.status}. Check the model, key and account limits. Not retried.` });
      data = await response.json();
    } catch { return finish({ ...entry, status: 'unknown', durationMs: Date.now() - entry.at }, { error: 'Request interrupted. It may still be billed if it reached the provider. Not retried.' }); }
    const usage = protocol === 'chat' && data.usage ? { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens, input_tokens_details: data.usage.prompt_tokens_details } : data.usage;
    entry.usage = normalizeUsage(protocol === 'anthropic' ? 'anthropic' : 'openai', usage);
    entry.estimatedCost = estimateCost(entry.usage, rates); entry.rates = rates || null;
    entry.status = data.error || data.status === 'failed' ? 'failed' : data.status === 'incomplete' || data.stop_reason === 'max_tokens' || data.choices?.[0]?.finish_reason === 'length' ? 'incomplete' : 'completed';
    entry.durationMs = Date.now() - entry.at;
    const message = data.choices?.[0]?.message;
    const text = protocol === 'responses' ? (data.output_text || (data.output || []).flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text).join('\n')) : protocol === 'anthropic' ? (data.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n') : message?.content;
    if (typeof text === 'string' && text) lastText = text;
    const calls = protocol === 'responses' ? (data.output || []).filter(x => x.type === 'function_call').map(x => ({ id: x.call_id, name: x.name, arguments: x.arguments })) : protocol === 'anthropic' ? (data.content || []).filter(x => x.type === 'tool_use').map(x => ({ id: x.id, name: x.name, arguments: x.input })) : (message?.tool_calls || []).map(x => ({ id: x.id, name: x.function?.name, arguments: x.function?.arguments }));
    if (!hub || !calls.length || entry.status !== 'completed') return finish(entry, { text: lastText || 'No text returned.' });
    if (round === 7 || calls.length > 24) return finish({ ...entry, status: 'incomplete' }, { error: 'Tool limit reached. Continue with a new request.' });
    entries.push(entry); await onEntry(entry);
    if (protocol === 'responses') input.push(...data.output);
    else messages.push(protocol === 'anthropic' ? { role: 'assistant', content: data.content } : message);
    const anthropicResults = [];
    for (const item of calls) {
      let result;
      try { result = await hub.invoke(item.name, typeof item.arguments === 'string' ? JSON.parse(item.arguments) : item.arguments); }
      catch { result = textResult('Tool call failed. Check its name, arguments and connection.', true); }
      if (protocol === 'responses') input.push({ type: 'function_call_output', call_id: item.id, output: toolContent(result, protocol) });
      else if (protocol === 'anthropic') anthropicResults.push({ type: 'tool_result', tool_use_id: item.id, content: toolContent(result, protocol), is_error: !!result.isError });
      else messages.push({ role: 'tool', tool_call_id: item.id, content: JSON.stringify(result.content.map(x => x.type === 'image' ? { type: 'text', text: 'Image result omitted: this API format uses text tool results.' } : x)) });
    }
    if (anthropicResults.length) messages.push({ role: 'user', content: anthropicResults });
  }
}
module.exports = { runApi };
