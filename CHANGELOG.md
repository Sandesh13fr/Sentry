# Changelog

## 1.0.0 (2026-11-20)

First complete prototype.

- Deterministic engine `sentry-sim-1.0.0` (FNV-1a seed, mulberry32), with a byte-identical client copy and a parity test.
- Strategy validation, a local keyword parser with negation, and an OpenRouter adapter (it replaces Gemini) with local fallback.
- SHA-256 fingerprint over canonical JSON. Prompts are never hashed or sent on chain.
- JSON-file store with atomic writes, and an optional `node:sqlite` store behind the same interface.
- `node:http` REST API: health, create, list and search, get, verify, repeat, anchor. 10 KB body limit, traversal-safe static files, CSP.
- `SentryAnchor.sol` (no payable functions), a precompiled artifact, and a deploy script. The ethers v6 chain adapter has a timeout and a graceful "unavailable".
- Web client rebuilt from the approved prototype and wired to the API. It uses the Sentry SVG asset pack, themed for light and dark, and adds AA contrast fixes, keyboard history, a range scrubber and reduced motion.
- 71 `node:test` tests, with TC-01 to TC-04 named explicitly.
- Docs: README with a demo script, API reference, architecture, testing matrix, report notes, design notes, three report diagrams, and a brand image prompt.
