import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createServer } from '../src/server.js';
import { createMemoryStore, createJsonStore } from '../src/store.js';
import { createChain } from '../src/chain.js';
import { parseLocal } from '../src/parser.js';
import { SIM_VERSION } from '../src/engine.js';

const quiet = { warn() {}, error() {} };
async function start(deps) {
  const server = createServer({ logger: quiet, chain: createChain({}), ...deps });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { server, base, call, close: () => new Promise((r) => server.close(r)) };
}
const rawGet = (base, path) => new Promise((resolve, reject) => {
  const u = new URL(base);
  http.get({ host: u.hostname, port: u.port, path }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, text: d })); }).on('error', reject);
});
const STRATS = { strategyA: 'Rush in fast and attack relentlessly. Never defend.', strategyB: 'Patient tank. Guard, block and counter.' };

describe('API with in-memory store, no AI, no chain', () => {
  let app;
  before(async () => { app = await start({ store: createMemoryStore() }); });
  after(() => app.close());

  test('GET /api/health', async () => {
    const r = await app.call('GET', '/api/health');
    assert.equal(r.status, 200);
    assert.deepEqual(
      { ok: r.json.ok, v: r.json.simulationVersion, ai: r.json.aiConfigured, chain: r.json.chainConfigured },
      { ok: true, v: SIM_VERSION, ai: false, chain: false },
    );
  });

  test('POST /api/matches creates a full record with local source', async () => {
    const r = await app.call('POST', '/api/matches', { ...STRATS, seed: 'arena-001' });
    assert.equal(r.status, 201);
    const m = r.json;
    assert.match(m.id, /^[0-9a-f-]{36}$/);
    assert.ok(!Number.isNaN(Date.parse(m.createdAt)));
    assert.deepEqual(m.parserSource, { A: 'local', B: 'local' });
    assert.deepEqual(m.attrsA, parseLocal(STRATS.strategyA));
    assert.equal(m.result.seed, 'arena-001');
    assert.match(m.fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(m.anchor.status, 'not-requested');
    assert.ok(Array.isArray(m.result.log) && m.result.log.length > 0);
  });

  test('same inputs and seed give the same fingerprint', async () => {
    const a = await app.call('POST', '/api/matches', { ...STRATS, seed: 'same-1' });
    const b = await app.call('POST', '/api/matches', { ...STRATS, seed: 'same-1' });
    assert.equal(a.json.fingerprint, b.json.fingerprint);
    assert.notEqual(a.json.id, b.json.id);
  });

  test('blank seed picks a random 12-hex seed', async () => {
    const r = await app.call('POST', '/api/matches', { ...STRATS, seed: '' });
    assert.match(r.json.result.seed, /^[0-9a-f]{12}$/);
  });

  describe('TC-01 at the API: input is rejected with a clear message', () => {
    const cases = [
      [{ strategyA: '', strategyB: 'x' }, 'strategyA', 'Fighter A strategy cannot be blank.'],
      [{ strategyA: 'x', strategyB: '   ' }, 'strategyB', 'Fighter B strategy cannot be blank.'],
      [{ strategyA: 'x'.repeat(301), strategyB: 'x' }, 'strategyA', 'Fighter A strategy is too long (max 300 characters).'],
      [{ strategyA: 'x', strategyB: 'y', seed: 'has space' }, 'seed', null],
    ];
    for (const [body, field, msg] of cases) {
      test(`${field}: ${msg ?? 'bad seed'}`, async () => {
        const r = await app.call('POST', '/api/matches', body);
        assert.equal(r.status, 400);
        assert.equal(r.json.field, field);
        if (msg) assert.equal(r.json.error, msg); else assert.ok(r.json.error);
      });
    }
    test('malformed JSON', async () => {
      const r = await app.call('POST', '/api/matches', '{nope');
      assert.equal(r.status, 400); assert.ok(r.json.error);
      assert.ok(!r.text.includes('at '), 'no stack trace');
    });
    test('body over 10 KB is refused with 413', async () => {
      const r = await app.call('POST', '/api/matches', { strategyA: 'x'.repeat(11 * 1024), strategyB: 'y' });
      assert.equal(r.status, 413); assert.ok(r.json.error);
    });
  });

  test('GET /api/matches lists newest first, with search and limit', async () => {
    await app.call('POST', '/api/matches', { strategyA: 'zebra unique', strategyB: 'b', seed: 'find-me' });
    const all = await app.call('GET', '/api/matches');
    assert.equal(all.status, 200);
    assert.ok(all.json.matches.length >= 2);
    const times = all.json.matches.map((m) => m.createdAt);
    assert.deepEqual(times, [...times].sort().reverse());
    assert.equal((await app.call('GET', '/api/matches?q=zebra')).json.matches.length, 1);
    assert.equal((await app.call('GET', '/api/matches?q=find-me')).json.matches.length, 1);
    assert.equal((await app.call('GET', '/api/matches?limit=1')).json.matches.length, 1);
    assert.equal((await app.call('GET', '/api/matches?q=nothing-matches-this')).json.matches.length, 0);
  });

  test('GET /api/matches/:id and 404s', async () => {
    const m = (await app.call('POST', '/api/matches', STRATS)).json;
    assert.equal((await app.call('GET', `/api/matches/${m.id}`)).json.id, m.id);
    assert.equal((await app.call('GET', '/api/matches/00000000-0000-4000-8000-000000000000')).status, 404);
    assert.equal((await app.call('GET', '/api/matches/not-an-id')).status, 404);
  });

  test('POST verify and repeat (TC-02 server side)', async () => {
    const m = (await app.call('POST', '/api/matches', { ...STRATS, seed: 'verify-1' })).json;
    const v = await app.call('POST', `/api/matches/${m.id}/verify`);
    assert.deepEqual([v.json.verified, v.json.versionMatches], [true, true]);
    assert.equal(v.json.storedFingerprint, v.json.recomputedFingerprint);
    const rep = await app.call('POST', `/api/matches/${m.id}/repeat`);
    assert.deepEqual([rep.json.runs, rep.json.identical], [100, 100]);
    assert.match(rep.json.outcomeFingerprint, /^[0-9a-f]{64}$/);
  });

  test('TC-04 at the API: match succeeds and anchor shows unavailable', async () => {
    const m = await app.call('POST', '/api/matches', STRATS);
    assert.equal(m.status, 201);
    const a = await app.call('POST', `/api/matches/${m.json.id}/anchor`);
    assert.equal(a.status, 200);
    assert.equal(a.json.anchor.status, 'unavailable');
    assert.ok(a.json.anchor.reason);
    assert.equal((await app.call('GET', `/api/matches/${m.json.id}`)).json.anchor.status, 'unavailable');
  });

  test('static files and path traversal guard', async () => {
    const idx = await app.call('GET', '/');
    assert.equal(idx.status, 200);
    assert.match(idx.headers.get('content-type'), /text\/html/);
    assert.ok(idx.headers.get('content-security-policy'));
    assert.equal((await app.call('GET', '/engine.client.js')).status, 200);
    for (const p of ['/../package.json', '/%2e%2e/package.json', '/..%2f..%2fpackage.json', '/%2e%2e%5c%2e%2e%5cpackage.json', '/assets/../../src/server.js']) {
      const r = await rawGet(app.base, p);
      assert.ok([400, 403, 404].includes(r.status), `${p} -> ${r.status}`);
      assert.ok(!r.text.includes('"name": "sentry-arena"') && !r.text.includes('createServer'), `${p} leaked a file`);
    }
    assert.equal((await app.call('GET', '/api/nope')).status, 404);
    assert.equal((await app.call('DELETE', '/api/matches')).status, 405);
  });
});

describe('TC-03 at the API: AI returns invalid output, local parser supplies bounded stats', () => {
  let app;
  before(async () => {
    const ai = async () => { throw new Error('bad JSON from model'); };
    ai.model = 'stub';
    app = await start({ store: createMemoryStore(), ai });
  });
  after(() => app.close());
  test('match succeeds with local-fallback source', async () => {
    const r = await app.call('POST', '/api/matches', STRATS);
    assert.equal(r.status, 201);
    assert.deepEqual(r.json.parserSource, { A: 'local-fallback', B: 'local-fallback' });
    assert.deepEqual(r.json.attrsA, parseLocal(STRATS.strategyA));
    assert.equal((await app.call('GET', '/api/health')).json.aiConfigured, true);
  });
});

describe('demo switches take the real fallback paths', () => {
  let app, chainCalls = 0;
  before(async () => {
    const ai = async () => ({ aggression: 5, speed: 5, defence: 5 }); ai.model = 'stub';
    const chain = { configured: true, anchor: async () => { chainCalls++; return { status: 'anchored', txHash: '0x1', at: '' }; } };
    app = await start({ store: createMemoryStore(), ai, chain });
  });
  after(() => app.close());
  test('aiDown forces local-fallback even with a working AI', async () => {
    const r = await app.call('POST', '/api/matches', { ...STRATS, demo: { aiDown: true } });
    assert.deepEqual(r.json.parserSource, { A: 'local-fallback', B: 'local-fallback' });
    const ok = await app.call('POST', '/api/matches', STRATS);
    assert.deepEqual(ok.json.parserSource, { A: 'openrouter', B: 'openrouter' });
  });
  test('rpcDown reports unavailable without calling the chain', async () => {
    const m = (await app.call('POST', '/api/matches', STRATS)).json;
    const a = await app.call('POST', `/api/matches/${m.id}/anchor`, { demo: { rpcDown: true } });
    assert.equal(a.json.anchor.status, 'unavailable');
    assert.equal(chainCalls, 0);
  });
});

describe('anchoring with a stub chain', () => {
  let app, sent = [];
  before(async () => {
    const chain = { configured: true, anchor: async (fp) => { sent.push(fp); return { status: 'anchored', txHash: '0xabc', explorerUrl: 'https://x/tx/0xabc', at: new Date().toISOString() }; } };
    app = await start({ store: createMemoryStore(), chain });
  });
  after(() => app.close());
  test('only the fingerprint is sent, and anchoring is idempotent', async () => {
    const m = (await app.call('POST', '/api/matches', STRATS)).json;
    const [a, b] = await Promise.all([app.call('POST', `/api/matches/${m.id}/anchor`), app.call('POST', `/api/matches/${m.id}/anchor`)]);
    assert.equal(a.json.anchor.txHash, '0xabc'); assert.equal(b.json.anchor.txHash, '0xabc');
    await app.call('POST', `/api/matches/${m.id}/anchor`);
    assert.deepEqual(sent, [m.fingerprint]);
  });
});

describe('persistence across restart and tamper detection', () => {
  let dir;
  before(async () => { dir = await mkdtemp(join(tmpdir(), 'sentry-api-')); });
  after(() => rm(dir, { recursive: true, force: true }));
  test('a saved match survives a restart and verifies as identical', async () => {
    const file = join(dir, 'matches.json');
    let store = createJsonStore(file); await store.init();
    let app = await start({ store });
    const m = (await app.call('POST', '/api/matches', { ...STRATS, seed: 'restart' })).json;
    await app.close();

    store = createJsonStore(file); await store.init();
    app = await start({ store });
    const got = await app.call('GET', `/api/matches/${m.id}`);
    assert.equal(got.json.fingerprint, m.fingerprint);
    assert.equal((await app.call('POST', `/api/matches/${m.id}/verify`)).json.verified, true);
    await app.close();

    const data = JSON.parse(await readFile(file, 'utf8'));
    data.matches[0].result.hpA = Math.min(100, data.matches[0].result.hpA + 15);
    await writeFile(file, JSON.stringify(data));
    store = createJsonStore(file); await store.init();
    app = await start({ store });
    const v = (await app.call('POST', `/api/matches/${m.id}/verify`)).json;
    assert.equal(v.verified, false);
    assert.ok(v.note);
    await app.close();
  });
});
