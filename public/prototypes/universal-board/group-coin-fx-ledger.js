// Optional presentation memory only. Never authorizes a move, claim or wallet write.
export function createGroupCoinFxLedger({ storage = () => globalThis.localStorage } = {}) {
  const records = new Map();
  const load = (scope) => {
    if (!records.has(scope)) {
      let saved;
      try { saved = JSON.parse(storage()?.getItem(`ximitu.group-coin-fx.v1:${encodeURIComponent(scope)}`) || 'null'); } catch { /* memory fallback */ }
      const strings = value => Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
      records.set(scope, { pending: new Set(strings(saved?.pending)), seen: new Set(strings(saved?.seen)) });
    }
    return records.get(scope);
  };
  const save = (scope) => {
    const record = load(scope);
    try { storage()?.setItem(`ximitu.group-coin-fx.v1:${encodeURIComponent(scope)}`, JSON.stringify({ pending: [...record.pending], seen: [...record.seen].slice(-4096) })); } catch { /* effects never block required rule/position persistence */ }
  };
  return {
    // Existing confirmed receipts are the starting baseline, not a new reward show.
    track(scope, moveId, knownIds = []) {
      const record = load(scope);
      if (!record.pending.has(moveId)) {
        knownIds.forEach(id => record.seen.add(id));
        record.pending.add(moveId); save(scope);
      }
    },
    pending: scope => [...load(scope).pending],
    seen: scope => [...load(scope).seen],
    mark(scope, ids) { ids.forEach(id => load(scope).seen.add(id)); save(scope); },
    complete(scope, moveId) { load(scope).pending.delete(moveId); save(scope); },
  };
}
