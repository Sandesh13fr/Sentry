// Deterministic match engine. Pure: no Math.random, no Date, no I/O.
// Logic is byte-for-byte the approved prototype's simulate(). public/engine.client.js mirrors it (see test/parity.test.js).
export const SIM_VERSION = 'sentry-sim-1.0.0';
export const START_HP = 100;
export const MAX_ROUNDS = 30;

export function seedToUint32(seed) {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function createRng(seed) {
  let a = seedToUint32(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { int: (n) => Math.floor(next() * n) };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function simulate(A, B, seed) {
  const rng = createRng(seed), F = { A, B }, hp = { A: START_HP, B: START_HP }, guard = { A: false, B: false }, log = [];
  let rounds = 0;
  for (let round = 1; round <= MAX_ROUNDS && hp.A > 0 && hp.B > 0; round++) {
    rounds = round;
    const iA = F.A.speed + rng.int(6), iB = F.B.speed + rng.int(6);
    const order = iA > iB ? ['A', 'B'] : iB > iA ? ['B', 'A'] : (rng.int(2) === 0 ? ['A', 'B'] : ['B', 'A']);
    for (const actor of order) {
      if (hp.A <= 0 || hp.B <= 0) break;
      const target = actor === 'A' ? 'B' : 'A', me = F[actor], foe = F[target];
      if (rng.int(100) < clamp(25 + me.aggression * 7, 0, 90)) {
        if (rng.int(100) < clamp(55 + (me.speed - foe.speed) * 4, 20, 95)) {
          let dmg = 4 + me.aggression + rng.int(5) - Math.floor(foe.defence / 2);
          const crit = rng.int(100) < 10; if (crit) dmg *= 2;
          let blocked = false; if (guard[target]) { dmg = Math.floor(dmg / 2); guard[target] = false; blocked = true; }
          dmg = Math.max(1, dmg); hp[target] = Math.max(0, hp[target] - dmg);
          log.push({ round, actor, type: 'hit', damage: dmg, crit, blocked, hpA: hp.A, hpB: hp.B });
        } else log.push({ round, actor, type: 'miss', damage: 0, crit: false, blocked: false, hpA: hp.A, hpB: hp.B });
      } else { guard[actor] = true; log.push({ round, actor, type: 'guard', damage: 0, crit: false, blocked: false, hpA: hp.A, hpB: hp.B }); }
    }
  }
  const winner = hp.A > hp.B ? 'A' : hp.B > hp.A ? 'B' : 'draw';
  return { version: SIM_VERSION, seed: String(seed), winner, hpA: hp.A, hpB: hp.B, rounds, koWin: hp.A === 0 || hp.B === 0, log };
}
