// Optional SQLite store using built-in node:sqlite (Node 22.13+). Same interface as src/store.js.
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { matchesQuery } from './store.js';

export async function sqliteAvailable() {
  try { await import('node:sqlite'); return true; } catch { return false; }
}

export function createSqliteStore(file) {
  let db;
  const row = (r) => (r ? JSON.parse(r.doc) : null);
  return {
    kind: 'sqlite',
    file,
    async init() {
      const { DatabaseSync } = await import('node:sqlite');
      if (file !== ':memory:') await mkdir(dirname(file), { recursive: true });
      db = new DatabaseSync(file);
      db.exec('CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, doc TEXT NOT NULL)');
    },
    async save(r) {
      db.prepare('INSERT OR REPLACE INTO matches (id, created_at, doc) VALUES (?, ?, ?)').run(r.id, r.createdAt, JSON.stringify(r));
      return structuredClone(r);
    },
    async get(id) { return row(db.prepare('SELECT doc FROM matches WHERE id = ?').get(id)); },
    async update(id, patch) {
      const cur = await this.get(id);
      if (!cur) return null;
      const next = { ...cur, ...structuredClone(patch) };
      db.prepare('UPDATE matches SET doc = ? WHERE id = ?').run(JSON.stringify(next), id);
      return next;
    },
    async list({ q = '', limit = 50 } = {}) {
      const n = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 50));
      // ponytail: filters in JS over all rows; add FTS5 if history grows past a few thousand matches.
      return db.prepare('SELECT doc FROM matches ORDER BY created_at DESC').all().map(row).filter((m) => matchesQuery(m, q)).slice(0, n);
    },
  };
}
