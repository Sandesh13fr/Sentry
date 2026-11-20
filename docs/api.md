# API reference

Base URL: `http://localhost:3000`. Every response is JSON. Errors look like `{ "error": "…" }`, and validation errors add `"field"`. Bodies are limited to 10 KB (413). Stack traces are never returned.

The curl examples work in PowerShell 7+ and Git Bash. In Windows PowerShell 5.1, call `curl.exe` explicitly.

## GET /api/health

```bash
curl http://localhost:3000/api/health
```
```json
{ "ok": true, "simulationVersion": "sentry-sim-1.0.0", "aiConfigured": false, "aiProvider": "local", "aiModel": null, "chainConfigured": false }
```

## POST /api/matches

Body: `{ strategyA, strategyB, seed? }`.

- Each strategy has control characters stripped, whitespace collapsed and ends trimmed. It must then be between 1 and 300 characters.
- `seed` is optional and can use letters, digits, `_` and `-`, up to 64 characters. Blank means the server picks 12 random hex characters.
- The optional `demo` field is for the live demo switches. `{ "demo": { "aiDown": true } }` forces the local fallback parser.

```bash
curl -X POST http://localhost:3000/api/matches -H "content-type: application/json" \
  -d '{"strategyA":"Rush in fast and attack relentlessly. Never defend.","strategyB":"Patient tank. Guard, block and counter.","seed":"arena-001"}'
```
201 returns the full record:
```json
{
  "id": "6f1c…", "createdAt": "2026-11-20T06:39:12.120Z",
  "strategyA": "Rush in fast and attack relentlessly. Never defend.", "strategyB": "Patient tank. Guard, block and counter.",
  "attrsA": { "aggression": 9, "speed": 7, "defence": 3 }, "attrsB": { "aggression": 3, "speed": 5, "defence": 9 },
  "parserSource": { "A": "local", "B": "local" },
  "result": { "version": "sentry-sim-1.0.0", "seed": "arena-001", "winner": "A", "hpA": 90, "hpB": 0, "rounds": 24, "koWin": true, "log": [ … ] },
  "fingerprint": "fe45e763…4bf0cf",
  "anchor": { "status": "not-requested" }
}
```
400 example:
```json
{ "error": "Fighter A strategy cannot be blank.", "field": "strategyA" }
```

## GET /api/matches?q=&limit=

Returns matches newest first. `q` searches id, both strategies, winner (`fighter a`), seed and fingerprint, ignoring case. `limit` is 1 to 100, default 50.

```bash
curl "http://localhost:3000/api/matches?q=arena&limit=10"
```
```json
{ "matches": [ { …record… } ] }
```

## GET /api/matches/:id

Returns the record, or 404 `{ "error": "Match not found." }`.

## POST /api/matches/:id/verify

The server re-runs the engine from the stored stats and seed, then compares fingerprints.

```json
{ "verified": true, "versionMatches": true, "storedFingerprint": "fe45…", "recomputedFingerprint": "fe45…" }
```
When verification fails, `note` explains why: a different engine version, a record edited after saving, or a re-run that differs.

## POST /api/matches/:id/repeat

The server-side TC-02 check runs the stored match 100 times.

```json
{ "runs": 100, "identical": 100, "outcomeFingerprint": "sha256 of the canonical result" }
```

## POST /api/matches/:id/anchor

This sends **only** the fingerprint (as `bytes32`) to `SentryAnchor`. It returns the updated record and is idempotent once anchored. Concurrent clicks share one transaction. The optional body `{ "demo": { "rpcDown": true } }` simulates an unreachable RPC.

```json
{ "…": "…", "anchor": { "status": "anchored", "txHash": "0x…", "explorerUrl": "https://testnet.monadexplorer.com/tx/0x…", "at": "…" } }
```
If the chain is not configured or the RPC fails:
```json
{ "anchor": { "status": "unavailable", "reason": "Testnet RPC timed out.", "at": "…" } }
```

## Static files

Every other `GET` serves from `public/`. Paths are decoded, normalised and confined to `public/`; traversal attempts return 403 or 404. HTML responses carry a strict Content-Security-Policy.
