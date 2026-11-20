# Design

Source of truth: the approved prototype (`sentry-prototype.html`), as implemented in `public/`. Mode: **Operate** (a demo console, not a landing page).

## World
A calm engineering console. Off-white paper with a 22px dotted grid, hairline panels, one ember accent. The arena is the single bold element. Proof (fingerprint, checks) and history sit below it with equal seriousness.

## Tokens (`public/styles.css` `:root`)
- Ground: `--bg #FAFAF8` / dark `#121110`. Surface: `#FFFFFF` / `#1A1917`. Ink: `#1C1B19` / `#F2F0EB`. Muted: `#6F6C66` / `#A39F98`. Lines: `#E8E5DF`, `#D6D2CA`.
- Ember `#F2541B` (Fighter A, brand, focus). The primary fill is `--ember-strong` for AA. Steel `#2D62E3` (Fighter B).
- Semantic: good `#0F7A44`, bad `#C2352A`, warn `#965700`, each with a `-soft` tint.
- Robot materials: `--bot-line|helm|body|hip|trim|steel|blade`, lifted in dark mode.
- Radii 6/10/14px. No shadows except focus rings and the invalid ring.

## Type
Geist 400–700 for UI. Geist Mono with tabular numbers for seeds, hashes, HP, rounds and counts. The H1 is a clamp from 28 to 40px at −0.03em. Panel titles are 14.5px at 600. Body text is 15px. Metadata is 12.5–13px.

## Layout
A sticky header with status chips. Intro. A top grid with the composer (360px) beside the arena. A middle grid of stats, log and fingerprint (1fr, 1.15fr, 1fr). A full-width history table that scrolls horizontally in its own container. Breakpoints at 1040px (stack the top grid, two mid columns) and 680px (single column, nav hidden, only the parser chip shown).

## Components
Panels with a header row; textarea and seed fields with the ember focus ring and a red invalid ring; primary, secondary and icon-only buttons; switch toggles; HP tracks (B mirrored); the 10-pip stat meter; source chips; the fingerprint box; check cards with a result line; a meter; winner pills; anchor status labels; toast; winner banner.

## Art
The Sentry SVG asset pack provides the Striker, Runner and Tank robots, the hit spark, crit burst, whiff, guard ring, KO stamp, and the 2px round-cap line icons. All art is inline `<symbol>`s with team colour through `currentColor`. There are no raster images, icon fonts or emoji.

## Motion
The replay ticks at 520ms ÷ speed. Lunge 140ms, hurt shake 320ms, spark burst 450ms, damage float 700ms, KO tilt and stamp, banner slide-in. Everything uses `--ease-out`. Under reduced motion, a new match lands on the final frame and transitions are near zero.
