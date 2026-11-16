// Pure helpers for routing tier pickers and excluded-model checklists.
// No DOM or state dependencies; imported by accounts-settings and unit-tested.

// Build select options for a tier picker.
// Returns [{value, label, notFound}] where value = "accountId model".
// Stored entries absent from discovered models appear as notFound.
export function tierOptions(accounts, storedEntries = []) {
  const discovered = [];
  for (const account of (accounts || [])) {
    for (const m of (account.models || [])) {
      if (m.available === true) {
        const label = `${account.label || account.id} \u2013 ${m.id}`;
        discovered.push({ value: `${account.id} ${m.id}`, label });
      }
    }
  }
  const discoveredValues = new Set(discovered.map(d => d.value));
  const extra = (storedEntries || [])
    .filter(e => e && e.accountId && e.model)
    .map(e => `${e.accountId} ${e.model}`)
    .filter(v => !discoveredValues.has(v))
    .map(v => ({ value: v, label: `${v} (not found)`, notFound: true }));
  return discovered.concat(extra);
}

// All model IDs found in any account's models list (deduped).
// Used for the excluded-models checklist.
export function excludedModelCandidates(accounts) {
  const seen = new Set(), result = [];
  for (const account of (accounts || [])) {
    for (const m of (account.models || [])) {
      if (!seen.has(m.id)) { seen.add(m.id); result.push(m.id); }
    }
  }
  return result;
}

// Normalize stored [{accountId, model}] or legacy "accountId model\n..." text
// to [{accountId, model}]. Drops malformed entries silently.
export function normalizeEntries(value) {
  if (Array.isArray(value)) return value.filter(e => e && typeof e.accountId === 'string' && typeof e.model === 'string');
  if (typeof value === 'string') {
    return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const parts = line.split(/\s+/);
      return parts.length === 2 ? { accountId: parts[0], model: parts[1] } : null;
    }).filter(Boolean);
  }
  return [];
}
