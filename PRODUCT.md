# Product

<!-- impeccable:product-schema 1 -->
<!-- Written from the project brief (sentry-agent-prompt.json) without a live interview: the brief asked for autonomous work. Inferred facts are marked (inferred). -->

## Platform

web

## Stack
Node.js 20.6+ REST API on built-in modules, plain HTML/CSS/vanilla ES modules client, OpenRouter for AI parsing with a local fallback, Solidity on Monad testnet through ethers v6 (optional). Fixed by the synopsis.

## Users
MCA faculty examiners and fellow students watching a live demo of under two minutes, with the student driving. A secondary user is a classmate running the project locally from the README.

## Product Purpose
Turn two plain-English fighter strategies into bounded stats and a deterministic match. Make reproducibility and verification visible and believable: the same inputs and seed give the same result, a saved result can be re-checked, and its fingerprint can be anchored on a testnet. Success means the examiners see a match replay, a green verify, a red verify after tampering, 100 of 100 identical runs, and graceful fallbacks when the AI or RPC is down.

## Positioning
Determinism is the product. Every match is a pure function of (engine version, attributes, seed), and the proof (fingerprint, re-run, testnet anchor) sits next to the spectacle rather than hidden behind it.

## Constraints
- No wagering, betting, tokens, rewards or real money of any kind.
- Single-user web prototype, with no multiplayer.
- Testnet only. The contract is labelled an unaudited academic prototype.
- Only a 32-byte fingerprint ever goes on chain. Strategy text never does.
- Free or test services only. Model availability may vary, so the app must work with no keys at all.

## Voice
Plain, active, specific, in sentence case. Buttons say exactly what they do: Run match, Verify, Anchor, Replay match.

## Accessibility
WCAG 2.1 AA contrast in light and dark, visible keyboard focus, reduced motion respected, usable at 360px wide.
