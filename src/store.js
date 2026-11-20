// Match store: JSON file (default) and in-memory, same interface as src/store-sqlite.js.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export function matchesQuery(m, q) {
  if (!q) return true;
  const hay = [m.id, m.strategyA, m.strategyB, m.result?.seed, m.fingerprint, 'fighter ' + m.result?.winner, m.result?.winner].join(' ').toLowerCase();
  return hay.includes(String(q).toLowerCase().trim());
}

const clampLimit = (limit) => Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 50));
const newestFirst = (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);
const clone = (v) => structuredClone(v);

function memoryCore(records = []) {
  const byId = new Map(records.map((r) => [r.id, r]));
  return {
    byId,
    get: async (id) => (byId.has(id) ? clone(byId.get(id)) : null),
    list: async ({ q = '', limit = 50 } = {}) => [...byId.values()].filter((m) => matchesQuery(m, q)).sort(newestFirst).slice(0, clampLimit(limit)).map(clone),
  };
}

export function createMemoryStore() {
  const core = memoryCore();
  return {
    kind: 'memory',
    init: async () => {},
    get: core.get,
    list: core.list,
    save: async (r) => { core.byId.set(r.id, clone(r)); return clone(r); },
    update: async (id, patch) => {
      if (!core.byId.has(id)) return null;
      const next = { ...core.byId.get(id), ...clone(patch) };
      core.byId.set(id, next); return clone(next);
    },
  };
}

export function createJsonStore(file) {
  let core = null;
  let queue = Promise.resolve(); // ponytail: single-process write queue; fine for a single-user prototype.

  async function load() {
    let text;
    try { text = await readFile(file, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    if (!text.trim()) return [];
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data?.matches)) throw new Error('shape');
      return data.matches;
    } catch { throw new Error(`Match store file is corrupt: ${file}`); }
  }

  async function persist() {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify({ version: 1, matches: [...core.byId.values()] }, null, 2));
    await rename(tmp, file); // atomic on the same volume
  }

  const write = (fn) => (queue = queue.then(fn, fn));

  return {
    kind: 'json',
    file,
    init: async () => { core = memoryCore(await load()); },
    get: (id) => core.get(id),
    list: (opts) => core.list(opts),
    save: (r) => write(async () => { core.byId.set(r.id, clone(r)); await persist(); return clone(r); }),
    update: (id, patch) => write(async () => {
      if (!core.byId.has(id)) return null;
      const next = { ...core.byId.get(id), ...clone(patch) };
      core.byId.set(id, next); await persist(); return clone(next);
    }),
  };
}
