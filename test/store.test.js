import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonStore, createMemoryStore } from '../src/store.js';
import { createSqliteStore, sqliteAvailable } from '../src/store-sqlite.js';

const rec = (i, extra = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`, createdAt: `2026-11-1${i}T10:00:00.000Z`,
  strategyA: `alpha ${i}`, strategyB: 'patient tank', attrsA: {}, attrsB: {},
  result: { seed: `seed-${i}`, winner: i % 2 ? 'A' : 'B' }, fingerprint: `${i}`.repeat(64), anchor: { status: 'not-requested' }, ...extra,
});

function suite(name, make) {
  describe(`${name} store`, () => {
    test('save, get, update, list newest first, search, limit', async () => {
      const s = await make(); await s.init();
      for (const i of [1, 3, 2]) await s.save(rec(i));
      assert.equal((await s.get(rec(2).id)).strategyA, 'alpha 2');
      assert.equal(await s.get('nope'), null);
      assert.deepEqual((await s.list()).map((m) => m.strategyA), ['alpha 3', 'alpha 2', 'alpha 1']);
      assert.equal((await s.list({ q: 'SEED-2' })).length, 1);
      assert.equal((await s.list({ q: 'fighter a' })).length, 2);
      assert.equal((await s.list({ q: '3333' })).length, 1);
      assert.equal((await s.list({ q: rec(1).id })).length, 1);
      assert.equal((await s.list({ limit: 1 })).length, 1);
      const u = await s.update(rec(1).id, { anchor: { status: 'anchored', txHash: '0xabc' } });
      assert.equal(u.anchor.status, 'anchored');
      assert.equal((await s.get(rec(1).id)).anchor.txHash, '0xabc');
      assert.equal(await s.update('nope', {}), null);
    });
    test('returned records are copies', async () => {
      const s = await make(); await s.init();
      await s.save(rec(1));
      (await s.get(rec(1).id)).result.winner = 'tampered';
      assert.equal((await s.get(rec(1).id)).result.winner, 'A');
    });
  });
}

const dir = await mkdtemp(join(tmpdir(), 'sentry-store-'));
let n = 0;
suite('memory', async () => createMemoryStore());
suite('json', async () => createJsonStore(join(dir, `m${n++}.json`)));
if (await sqliteAvailable()) suite('sqlite', async () => createSqliteStore(':memory:'));
else test('sqlite store', { skip: 'node:sqlite not available on this Node version' }, () => {});

test('json store survives a restart and leaves no tmp files', async () => {
  const file = join(dir, 'restart.json');
  const a = createJsonStore(file); await a.init();
  await Promise.all([1, 2, 3].map((i) => a.save(rec(i))));
  const b = createJsonStore(file); await b.init();
  assert.equal((await b.list()).length, 3);
  assert.deepEqual((await readdir(dir)).filter((f) => f.endsWith('.tmp')), []);
});

test('corrupt json store file raises a clear error', async () => {
  const file = join(dir, 'corrupt.json');
  await writeFile(file, '{ not json');
  await assert.rejects(createJsonStore(file).init(), /Match store file is corrupt/);
  await writeFile(file, '{"matches": 5}');
  await assert.rejects(createJsonStore(file).init(), /corrupt/);
});

test.after(() => rm(dir, { recursive: true, force: true }));
