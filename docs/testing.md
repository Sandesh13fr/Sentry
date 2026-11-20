# Testing

```powershell
npm test
```

This runs Node's built-in test runner (`node --test`), which picks up every `test/*.test.js`. There are no test dependencies. Last run: **71 tests, 71 pass, 0 fail** (Node 24.11, Windows 11).

## Synopsis test cases

| ID | Input | Expected | Where it is tested |
|---|---|---|---|
| TC-01 | Blank or over-limit strategy | Input is rejected with a clear message | `test/parser.test.js` → *TC-01* suite (blank, whitespace, control chars, 301 chars, missing, non-string); `test/api.test.js` → *TC-01 at the API* (400 with `field`, malformed JSON, 413 body limit) |
| TC-02 | Replay identical stats and seed 100 times | Every run returns the same outcome | `test/engine.test.js` → *TC-02*; `test/api.test.js` → *verify and repeat* (server `/repeat` = 100/100); the UI's **Repeat 100 times** runs 100 in the browser and 100 on the server |
| TC-03 | AI service returns an invalid response | Local parser supplies bounded stats | `test/parser.test.js` → *TC-03* suite (HTTP 500, network error, non-JSON, out-of-range, missing fields, no choices, bad body, timeout); `test/api.test.js` → *TC-03 at the API* |
| TC-04 | Testnet RPC is unavailable | Match succeeds; anchor status shows unavailable | `test/chain.test.js` → *TC-04* suite (missing config, unreachable RPC with real ethers, ethers missing, key never logged); `test/api.test.js` → *TC-04 at the API* |

## Other suites

| File | Covers |
|---|---|
| `engine.test.js` | FNV-1a values, RNG determinism, result and log shape, KO win, points win, draw, tie-breaks both ways, guard blocks |
| `parity.test.js` | Client (`public/engine.client.js`) and server engines give identical results, payloads and fingerprints across 50 random attribute and seed combos |
| `hash.test.js` | Canonical JSON key order, prompts excluded from fingerprint, any result change changes the hash |
| `store.test.js` | Memory, JSON and SQLite stores pass the same suite; restart survival; no leftover `.tmp`; corrupt file error |
| `chain.test.js` | Only `0x`+fingerprint is sent; already-anchored handled; malformed hash rejected; contract artifact has no payable/receive/fallback |
| `api.test.js` | Demo switches, every endpoint on an ephemeral port, search and limit, 404/405, idempotent anchor, static traversal guard, persistence across restart, tamper detection |

## Manual end-to-end checks (done in the in-app browser)

These were checked on 2026-11-20: run match, replay, verify (green), tamper and then verify (red with both hashes), repeat 100 (100/100 browser and server), anchor with the RPC-down switch, anchor without config, AI-down switch giving Local fallback chips and a toast, blank strategy inline error, history search and empty state, row reload, dark theme, light theme, and 360px width with no horizontal page scroll.
