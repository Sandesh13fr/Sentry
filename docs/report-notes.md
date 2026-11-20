# Report notes

Material for the MCA Semester I mini-project report. Figures are in `docs/diagrams/`: Fig 1.1 architecture, Fig 1.2 use case, Fig 1.3 Level-1 DFD.

## 1. Introduction

A player describes two fighters in plain English. The system converts each description into bounded attributes (aggression, speed, defence), using an AI language model through OpenRouter or a local rules-based parser. It then runs a computer-controlled match. A fixed seed makes the match repeatable. The result can be replayed, verified against its saved fingerprint, and optionally recorded as a compact hash on the Monad blockchain test network.

## 2. Objectives and how they are met

| Objective | Implementation |
|---|---|
| Accept two plain-language strategies and validate input | `validateStrategy` strips control characters, collapses whitespace and trims, then enforces 1–300 characters. The same messages appear inline in the UI and in API 400s |
| Generate bounded attributes via AI or local fallback | OpenRouter adapter (JSON mode, temperature 0, 8 s timeout, prompt-injection framing), then `normalise()` (1–10 each, 24-point budget). The local keyword parser handles negation |
| Simulate and replay deterministic matches from inputs and seed | `simulate()` uses an FNV-1a seed and mulberry32 PRNG, with no `Math.random` or `Date`. The client replays the stored log with an identical engine copy |
| Store history and optionally anchor a hash | JSON store with atomic writes (SQLite optional). `SentryAnchor` on Monad testnet stores only the fingerprint |

## 3. Modules

1. **Web client**: composer, arena replay (1×/2×/4×, scrubber), stats, log, proof panel, history.
2. **Prompt adapter**: OpenRouter, with local parser fallback. The source is shown per fighter as `openrouter`, `local` or `local-fallback`.
3. **Deterministic engine**: `sentry-sim-1.0.0`, 100 HP, up to 30 rounds, with initiative, attack, hit, damage, crit and guard rules.
4. **Match store**: keeps the inputs, engine version, seed, result, timestamp and optional tx reference.
5. **Chain adapter**: submits only the hash. It moves no funds and stores no prompts.

## 4. DFD Level 1 walkthrough (Fig 1.3)

1. **1.0 Validate input.** The Player sends two strategies and an optional seed. Invalid input goes straight back as an error message.
2. **2.0 Generate attributes.** Valid strategies go to OpenRouter as data only. The returned attributes are normalised. On any failure the local parser produces them instead.
3. **3.0 Simulate match.** Attributes and seed produce the result and the round-by-round log. The log returns to the Player for replay.
4. **4.0 Compute fingerprint.** The result-defining fields are hashed with SHA-256.
5. **5.0 Store match.** The full record is written to **D1 Match store**.
6. **6.0 Verify result.** The stored record is read, the match is re-simulated and its fingerprint recomputed. The verdict (verified or mismatch) returns to the Player.
7. **7.0 Anchor fingerprint.** The fingerprint (32 bytes) goes to Monad testnet. The tx hash returns and is saved to D1.

## 5. Test cases

See [testing.md](testing.md). TC-01 to TC-04 are named in the test titles. The current suite has 71 tests, all passing.

## 6. Assumptions and decisions (logged)

- **OpenRouter replaces Gemini.** The student chose this. The adapter calls OpenRouter's OpenAI-compatible `chat/completions` endpoint with `response_format: json_object`. The default model is `meta-llama/llama-3.3-70b-instruct:free`, configurable through `OPENROUTER_MODEL`. Free model ids change over time. If the configured id disappears, matches still work through the local fallback.
- **Out-of-range AI values are treated as invalid.** If the model returns, say, `aggression: 42`, that counts as a failed response, so the local fallback applies (TC-03). In-range values above the 24-point budget are normalised.
- **Validation message wording** follows the spec ("… is too long (max 300 characters).") rather than the prototype's wording.
- **Demo switches.** The prototype's *AI service is down* and *Testnet RPC is down* toggles are kept. They send an explicit `demo` flag, so the server takes the real fallback code paths. They never fake a result in the browser.
- **Tamper demo** edits only the browser copy of the result. Verify catches it because the server's re-run fingerprint no longer matches the hash of what is on screen. The server store is never modified by the UI.
- **Server-side repeat endpoint** (`POST /api/matches/:id/repeat`) was added because the client spec says the repeat test also calls the server.
- **SVG art.** The fighters, effects and icons come from the student-supplied Sentry SVG asset pack (`public/assets/pack/`, originals kept). For the live sprite, the pack's hard-coded hex colours are mapped to theme tokens so dark mode stays legible. Team colour comes from `currentColor`, so all three archetypes take ember for Fighter A and steel for Fighter B. The fighter archetype (Striker, Runner, Tank) is picked from the dominant stat.
- **Contract compiled ahead of time** (solc 0.8.24, evmVersion paris, optimizer 200), so deploying needs only `ethers`.
- **SQLite** uses built-in `node:sqlite` (Node 22.13+) instead of a native npm module. On older Node its tests are skipped.
- **Impeccable.** The skill was already installed globally. PRODUCT.md and DESIGN.md were written from the brief without an interview, because the brief said to work autonomously. The `visualize` command needs an image-generation tool, which this machine lacks. So the brand board was rendered inline instead, and a prompt for an external image generator was saved in `docs/brand-image-prompt.md`.

## 7. Limitations

- The prototype is single user, with no authentication. The JSON store's write queue is per process.
- AI attribute quality depends on the chosen free model, and free models have rate limits.
- Determinism holds only for the same engine version. Changing the rules requires bumping `SIM_VERSION`, and old matches then report `versionMatches: false`.
- The anchor contract is unaudited and testnet only. Anchoring proves a fingerprint existed at a block time. It does not prove who wrote the strategies.
- The local parser is keyword-based. Sarcasm, long negations and synonyms outside its word lists are missed.

## 8. Future scope

- A signed or anchored engine build hash, so that verification covers the code as well as the result.
- Batch anchoring with a Merkle root, so one transaction covers many matches.
- Multiplayer or tournaments with seeded brackets (no wagering).
- A richer rule set (stamina, special moves) under a new engine version.
- Export a match as a shareable JSON proof bundle that anyone can verify offline.
