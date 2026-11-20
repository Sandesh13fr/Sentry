import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as server from '../src/engine.js';
import * as client from '../public/engine.client.js';
import { canonical, fingerprint, payloadOf } from '../src/hash.js';

test('client and server engines agree on 50 random attribute + seed combos', async () => {
  const gen = server.createRng('parity-gen');
  for (let i = 0; i < 50; i++) {
    const at = () => ({ aggression: 1 + gen.int(10), speed: 1 + gen.int(10), defence: 1 + gen.int(10) });
    const a = at(), b = at(), seed = i % 3 ? 'seed-' + gen.int(1e6) : gen.int(1e9);
    const rs = server.simulate(a, b, seed), rc = client.simulate(a, b, seed);
    assert.equal(canonical(rc), canonical(rs), `combo ${i}`);
    const rec = { attrsA: a, attrsB: b, result: rs };
    assert.equal(client.canonical(client.payloadOf(rec)), canonical(payloadOf(rec)));
    assert.equal(await client.fingerprintOf(rec), fingerprint(rec));
  }
});

test('client and server share constants and seed hashing', () => {
  assert.equal(client.SIM_VERSION, server.SIM_VERSION);
  assert.equal(client.MAX_ROUNDS, server.MAX_ROUNDS);
  for (const s of ['', 'arena-001', 12345, 'ü']) assert.equal(client.seedToUint32(s), server.seedToUint32(s));
});
