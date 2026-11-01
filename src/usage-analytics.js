// The API ledger covers requests recorded by Paddock, independently of subscription quotas.
export function usageAnalytics(entries, days = 30, now = Date.now()) {
  const span = [7, 30, 90].includes(days) ? days : 30, day = 86400000, since = now - span * day;
  const points = Array.from({ length: span }, (_, i) => ({ at: since + i * day, requests: 0, tokens: 0 }));
  const providers = new Map(); let tokens = 0, unknownUsage = 0, duration = 0, measured = 0, failed = 0;
  const cloud = { tokens: 0, unknownUsage: 0 }, local = { tokens: 0, unknownUsage: 0 };
  const rows = entries.filter(row => Number.isFinite(row.at) && row.at >= since && row.at <= now);
  for (const row of rows) {
    const total = Number.isFinite(row.usage?.total) && row.usage.total >= 0 ? row.usage.total : null;
    const point = points[Math.min(span - 1, Math.floor((row.at - since) / day))];
    point.requests++; point.tokens += total ?? 0; tokens += total ?? 0;
    if (total === null) unknownUsage++;
    const target = row.local === true || row.provider === 'strata' ? local : cloud;
    target.tokens += total ?? 0; if (total === null) target.unknownUsage++;
    if (Number.isFinite(row.durationMs) && row.durationMs >= 0) { duration += row.durationMs; measured++; }
    if (row.status === 'failed') failed++;
    const provider = row.provider || 'Unknown', item = providers.get(provider) || { provider, requests: 0, tokens: 0 };
    item.requests++; item.tokens += total ?? 0; providers.set(provider, item);
  }
  return { days: span, rows, points, requests: rows.length, tokens, unknownUsage, cloud, local, failed, measured, averageMs: measured ? duration / measured : null, providers: [...providers.values()].sort((a,b) => b.requests - a.requests) };
}
