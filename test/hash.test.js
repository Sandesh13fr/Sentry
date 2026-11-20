import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonical, payloadOf, fingerprint } from '../src/hash.js';
import { simulate } from '../src/engine.js';

test('canonical JSON sorts keys at every depth', () => {
  assert.equal(canonical({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 'x' } }), '{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}');
  assert.equal(canonical({ x: 1, y: 2 }), canonical({ y: 2, x: 1 }));
});

const rec = () => {
  const attrsA = { aggression: 8, speed: 7, defence: 3 }, attrsB = { aggression: 3, speed: 4, defence: 9 };
  return { strategyA: 'secret plan A', strategyB: 'secret plan B', attrsA, attrsB, result: simulate(attrsA, attrsB, 'h') };
};

test('fingerprint is 64 hex and excludes prompts and the log', () => {
  const r = rec(), fp = fingerprint(r);
  assert.match(fp, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(payloadOf(r)).sort(), ['attrsA', 'attrsB', 'hpA', 'hpB', 'rounds', 'seed', 'version', 'winner']);
  assert.ok(!canonical(payloadOf(r)).includes('secret'));
  assert.equal(fingerprint({ ...r, strategyA: 'different words' }), fp);
});

test('any result change changes the fingerprint', () => {
  const r = rec(), fp = fingerprint(r);
  assert.notEqual(fingerprint({ ...r, result: { ...r.result, hpA: r.result.hpA + 1 } }), fp);
  assert.notEqual(fingerprint({ ...r, attrsA: { ...r.attrsA, speed: 1 } }), fp);
});
