import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, seedToUint32, createRng, SIM_VERSION, MAX_ROUNDS } from '../src/engine.js';
import { canonical } from '../src/hash.js';

const A = { aggression: 8, speed: 7, defence: 3 }, B = { aggression: 3, speed: 4, defence: 9 };

test('TC-02: identical version, attributes and seed give identical outcomes in 100 runs', () => {
  const ref = canonical(simulate(A, B, 'arena-001'));
  for (let i = 0; i < 100; i++) assert.equal(canonical(simulate(A, B, 'arena-001')), ref);
});

test('seed hashing is FNV-1a and treats numbers as strings', () => {
  assert.equal(seedToUint32(''), 2166136261);
  assert.equal(seedToUint32('a'), 0xe40c292c);
  assert.equal(seedToUint32(42), seedToUint32('42'));
  const r1 = createRng('x'), r2 = createRng('x');
  for (let i = 0; i < 20; i++) assert.equal(r1.int(1000), r2.int(1000));
});

test('different seeds usually give different logs', () => {
  const logs = new Set(['s1', 's2', 's3', 's4', 's5'].map((s) => canonical(simulate(A, B, s).log)));
  assert.ok(logs.size > 1);
});

test('result shape and log entries', () => {
  const r = simulate(A, B, 'shape');
  assert.equal(r.version, SIM_VERSION);
  assert.equal(r.seed, 'shape');
  assert.ok(['A', 'B', 'draw'].includes(r.winner));
  assert.ok(r.rounds >= 1 && r.rounds <= MAX_ROUNDS);
  for (const e of r.log) {
    assert.deepEqual(Object.keys(e).sort(), ['actor', 'blocked', 'crit', 'damage', 'hpA', 'hpB', 'round', 'type']);
    assert.ok(['hit', 'miss', 'guard'].includes(e.type));
    if (e.type === 'hit') assert.ok(e.damage >= 1); else assert.equal(e.damage, 0);
    assert.ok(e.hpA >= 0 && e.hpB >= 0);
  }
  const last = r.log.at(-1);
  assert.equal(last.hpA, r.hpA); assert.equal(last.hpB, r.hpB);
});

test('KO win ends the match early and sets koWin', () => {
  const r = simulate({ aggression: 10, speed: 10, defence: 4 }, { aggression: 1, speed: 1, defence: 1 }, 'ko');
  assert.equal(r.winner, 'A'); assert.equal(r.hpB, 0); assert.equal(r.koWin, true); assert.ok(r.rounds < MAX_ROUNDS);
});

test('points win after 30 rounds when nobody is knocked out', () => {
  const weak = { aggression: 1, speed: 5, defence: 10 };
  let found = null;
  for (let i = 0; i < 500 && !found; i++) { const r = simulate(weak, weak, 'p' + i); if (!r.koWin && r.winner !== 'draw') found = r; }
  assert.ok(found, 'expected a points win');
  assert.equal(found.rounds, MAX_ROUNDS); assert.equal(found.koWin, false);
});

test('draw when HP ends level', () => {
  const weak = { aggression: 1, speed: 5, defence: 10 };
  let found = null;
  for (let i = 0; i < 3000 && !found; i++) { const r = simulate(weak, weak, 'd' + i); if (r.winner === 'draw') found = r; }
  assert.ok(found, 'expected a draw');
  assert.equal(found.hpA, found.hpB);
});

test('initiative ties are broken both ways by the rng', () => {
  const same = { aggression: 5, speed: 5, defence: 5 };
  const firsts = new Set();
  for (let i = 0; i < 200; i++) firsts.add(simulate(same, same, 't' + i).log[0].actor);
  assert.deepEqual([...firsts].sort(), ['A', 'B']);
});

test('guard halves the next hit and is marked blocked', () => {
  let blocked = null;
  for (let i = 0; i < 200 && !blocked; i++) blocked = simulate(A, B, 'g' + i).log.find((e) => e.blocked);
  assert.ok(blocked); assert.equal(blocked.type, 'hit');
});
