import { createHash } from 'node:crypto';

export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

// Only result-defining fields. Strategy prompts are never hashed or sent anywhere.
export const payloadOf = (m) => ({
  version: m.result.version, seed: m.result.seed, attrsA: m.attrsA, attrsB: m.attrsB,
  winner: m.result.winner, hpA: m.result.hpA, hpB: m.result.hpB, rounds: m.result.rounds,
});

export const sha256Hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
export const fingerprint = (m) => sha256Hex(canonical(payloadOf(m)));
