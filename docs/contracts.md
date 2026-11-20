# Shared contracts

Every module builds against these interfaces. The lead owns this file. Change it here first, then in code.

AI provider: **OpenRouter** (it replaces Gemini from the original brief). The parser source values are `openrouter | local | local-fallback`.

## Engine (`src/engine.js`, mirrored in `public/engine.client.js`)

```js
export const SIM_VERSION = 'sentry-sim-1.0.0';
export const START_HP = 100, MAX_ROUNDS = 30;
export function seedToUint32(seed)            // FNV-1a over String(seed)
export function createRng(seed)               // mulberry32 -> { int(n) }
export function simulate(attrsA, attrsB, seed)
// -> { version, seed: String(seed), winner: 'A'|'B'|'draw', hpA, hpB, rounds, koWin,
//      log: [{ round, actor:'A'|'B', type:'hit'|'miss'|'guard', damage, crit, blocked, hpA, hpB }] }
```
The engine never calls `Math.random` or `Date`. Its logic is byte-for-byte the prototype's `simulate()`.

## Attributes

`{ aggression, speed, defence }`. Each is an integer from 1 to 10, and the sum is at most 24. While the sum is over 24, decrement the highest attribute (ties go in the order aggression, speed, defence).

## Parser (`src/parser.js`)

```js
validateStrategy(text, label) -> { value } | { error }
//   Strip control characters, collapse whitespace, trim.
//   Errors: '<label> cannot be blank.' and '<label> is too long (max 300 characters).'
validateSeed(seed) -> { value: string|null } | { error }
//   Blank gives null (the server picks 12 hex characters). Otherwise /^[A-Za-z0-9_-]{1,64}$/.
//   Error: 'Seed can use letters, numbers, "_" and "-" only, up to 64 characters.'
normalise(raw) -> attrs                 // throws on a non-finite field
parseLocal(text) -> attrs
createOpenRouterParser({ apiKey, model, fetch, timeoutMs = 8000 }) -> async (text) => attrs   // throws on any failure
resolveAttributes(text, ai?) -> { attributes, source }   // source: 'openrouter' | 'local' | 'local-fallback'
```

## Fingerprint (`src/hash.js`)

```js
canonical(value) -> string                 // sorted keys, JSON.stringify for primitives
payloadOf(record) -> { version, seed, attrsA, attrsB, winner, hpA, hpB, rounds }
fingerprint(record) -> 64-char lowercase hex   // sha256(canonical(payloadOf(record)))
```
Prompts are never part of the payload.

## Match record

```json
{
  "id": "uuid", "createdAt": "ISO-8601",
  "strategyA": "…", "strategyB": "…",
  "attrsA": {"aggression":8,"speed":7,"defence":3}, "attrsB": {…},
  "parserSource": {"A": "openrouter", "B": "local-fallback"},
  "result": { …engine output incl. log… },
  "fingerprint": "64 hex",
  "anchor": { "status": "not-requested|anchored|unavailable", "txHash": "0x…", "explorerUrl": "…", "reason": "…", "at": "ISO" }
}
```

## Store (`src/store.js`, `src/store-sqlite.js`)

```js
createJsonStore(file) / createMemoryStore() / createSqliteStore(file)
  -> { init(), save(record), get(id) -> record|null, update(id, patch) -> record|null, list({ q, limit }) -> record[] }
```
`list` returns newest first. It matches `q` case-insensitively against id, both strategies, `fighter <winner>`, seed and fingerprint. Writes are atomic (tmp file, then rename). A corrupt file throws `Match store file is corrupt: <path>`.

## Chain (`src/chain.js`)

```js
createChain({ rpcUrl, privateKey, contractAddress, explorerTxUrl, timeoutMs = 10000, loadEthers })
  -> { configured: boolean, anchor(fingerprintHex) -> { status:'anchored', txHash, explorerUrl, at } | { status:'unavailable', reason, at } }
```
It sends only `bytes32` (`0x` + the fingerprint). It never logs the private key and never throws.

## REST API (`src/server.js`)

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{ ok, simulationVersion, aiConfigured, aiProvider, chainConfigured }` |
| POST | `/api/matches` | body `{ strategyA, strategyB, seed? }`. Returns 201 and the full record, or 400 `{ error, field }` where field is `strategyA`, `strategyB`, `seed` or `body` |
| GET | `/api/matches?q=&limit=` | `{ matches: [] }`, newest first. limit is 1 to 100, default 50 |
| GET | `/api/matches/:id` | record, or 404 `{ error }` |
| POST | `/api/matches/:id/verify` | `{ verified, versionMatches, storedFingerprint, recomputedFingerprint, note? }` |
| POST | `/api/matches/:id/repeat` | `{ runs: 100, identical, outcomeFingerprint }` (server-side TC-02 check) |
| POST | `/api/matches/:id/anchor` | updated record. Idempotent once anchored |

Bodies are limited to 10 KB (413). Errors are always `{ error }` JSON, with no stack traces. Static files come from `public/`, guarded against path traversal. `createServer({ store, ai, chain })` exists for dependency injection.

## SVG sprite (`public/assets/sprite.svg`)

The sprite is built from the Sentry SVG asset pack (originals are in `public/assets/pack/`). `app.js` fetches it and injects it inline at boot. Hex colours are mapped to theme tokens, and team colour comes through `currentColor`.

| id | viewBox | notes |
|---|---|---|
| `logo` | 0 0 256 256 | shield mark |
| `fighter-striker`, `fighter-runner`, `fighter-tank` | 0 0 256 256 | chosen by dominant stat (aggression, speed, defence). They face right, feet at y≈218 |
| `effect-hit-spark`, `effect-critical-burst`, `effect-whiff`, `effect-guard-ring`, `effect-ko` | 0 0 256 256 | |
| `arena-floor` | 0 0 760 300 | floor lines, dashed ring, centre pylon |
| `icon-play icon-pause icon-replay icon-dice icon-check-circle icon-x-circle icon-alert-triangle icon-link icon-hash icon-ai-spark icon-cpu icon-search icon-copy icon-repeat icon-crossed-swords icon-trophy icon-flask icon-hexagon` | 0 0 24 24 | 2px stroke, round caps, `currentColor` |

## Demo switches

`POST /api/matches` accepts `demo: { aiDown: true }`, which forces the local-fallback path. `POST /api/matches/:id/anchor` accepts `demo: { rpcDown: true }`, which returns unavailable. These exist for the live demo of TC-03 and TC-04. They take the real server code paths.
