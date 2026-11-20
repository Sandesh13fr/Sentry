# Design notes

## Impeccable passes

| Pass | Result |
|---|---|
| `visualize` | No image-generation tool was available, so the brand board was rendered inline and an external prompt saved in [brand-image-prompt.md](brand-image-prompt.md) |
| `init` | PRODUCT.md written from the brief (assumptions labelled) |
| detector (`detect.mjs`) | 1 finding, justified below. The detector ran in degraded regex mode (its HTML/CSS parser modules are not installed), so computed contrast was checked by hand |
| audit (manual against `audit.md` checklist) | Fixed: AA contrast on the primary button, the Fighter A/B pills and the warn and good text; visible focus everywhere; skip link; `aria-invalid` and `aria-describedby` on fields; progressbars with values; keyboard-operable history rows (Enter, Space, arrows); range-input scrubber; `prefers-reduced-motion` honoured; CSP-safe (no inline styles or scripts) |

## Justified findings

- **"Overused font: Geist."** Kept. The approved prototype and the brief pin Geist and Geist Mono, and the brief wins over a saturated-pattern warning. Distinctiveness here comes from the single ember accent, the dotted engineering grid and the robot fighters, not the typeface.

## Contrast fixes vs. the prototype

| Element | Prototype | Now | Why |
|---|---|---|---|
| Primary button (light) | white on `#F2541B` (3.5:1) | white on `--ember-strong #D2440F` (4.6:1) | AA for 14px text |
| Primary button (dark) | white on `#FF6B33` (2.9:1) | ink `#1C1B19` on `#FF6B33` (6.0:1) | AA |
| Fighter A pill text | `#F2541B` on soft | `--ember-ink #B33A0C` | AA |
| Warn text | `#A86200` | `#965700` | AA on warn-soft |
| Good text | `#12844A` | `#0F7A44` | AA on good-soft |

The ember brand colour `#F2541B` itself is unchanged for marks, HP bars, swatches and art.

## Fighter art in dark mode

The asset pack's robots use near-black bodies (`#242321`), which disappear on the `#121110` dark background. The sprite maps those materials to `--bot-*` tokens. Dark mode lifts the body and helmet to warm greys and keeps a dark outline, so the silhouettes stay readable. The pack originals are untouched in `public/assets/pack/`.
