// Renderer state store. Today it wraps the legacy `dock:state` payload; it also
// applies v2 changes (docs/state-protocol.md) so a v2 transport can feed it
// without touching the views. Views subscribe to slices and are called only
// when a slice they name changed.

const equal = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

function changed(current, change) {
  if (change.kind !== 'patch') return change.value;
  const list = Array.isArray(current) ? current : [];
  const upsert = change.upsert || {}, removed = new Set(change.remove || []);
  const byId = new Map(list.filter(item => !removed.has(item.id)).map(item => [item.id, item]));
  for (const [id, dto] of Object.entries(upsert)) byId.set(id, dto);
  const known = new Set(list.map(item => item.id));
  const ids = change.order || [...list.map(item => item.id), ...Object.keys(upsert).filter(id => !known.has(id))];
  return ids.filter(id => byId.has(id)).map(id => byId.get(id));
}

export function createStateClient() {
  let state = null;
  const revisions = Object.create(null), listeners = new Set();

  function commit(next, slices) {
    state = next;
    for (const slice of slices) revisions[slice] = (revisions[slice] || 0) + 1;
    for (const entry of [...listeners]) if (!entry.slices || slices.some(slice => entry.slices.includes(slice))) entry.fn(state, slices);
  }

  return {
    get: () => state,
    revision: slice => revisions[slice] || 0,
    // Replace everything with a legacy snapshot. Returns the slices whose value changed.
    setLegacy(next) {
      const keys = new Set([...Object.keys(state || {}), ...Object.keys(next || {})]);
      const slices = [...keys].filter(key => !equal(state?.[key], next?.[key]));
      commit(next, slices);
      return slices;
    },
    // One v2 change: patch {upsert, remove, order}, replace {value}, reset {value}.
    applyChange(change) { return this.applyBatch([change]); },
    applyBatch(changes) {
      const next = { ...state }, slices = [];
      for (const change of changes) {
        const value = changed(next[change.slice], change);
        if (equal(next[change.slice], value)) continue;
        next[change.slice] = value;
        if (!slices.includes(change.slice)) slices.push(change.slice);
      }
      if (slices.length) commit(next, slices);
      return slices.length > 0;
    },
    // fn(state, changedSlices); `slices` omitted means every change.
    subscribe(slices, fn) {
      const entry = { slices: slices ? [].concat(slices) : null, fn };
      listeners.add(entry);
      return () => listeners.delete(entry);
    }
  };
}
