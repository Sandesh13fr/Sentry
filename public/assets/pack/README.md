# Sentry SVG asset pack

Editable, flat-vector SVG assets matching the Sentry brand board.

## Contents
- `fighters/`: Striker, Runner, Tank, plus Ember Fighter A and Steel Fighter B
- `effects/`: hit spark, critical burst, whiff, guard ring, KO
- `icons/`: 18 monochrome line icons
- `marks/`: Sentry shield mark
- `sentry-sprite-sheet.svg`: reusable `<symbol>` definitions for the three fighter archetypes, effects and icons

## Use an individual SVG
Import the file directly into Figma, Illustrator, Inkscape, or your web app.

## Use a symbol from the sprite sheet
Keep `sentry-sprite-sheet.svg` at a stable public path and reference it:
```html
<svg viewBox="0 0 256 256" aria-label="Striker">
  <use href="/assets/sentry-sprite-sheet.svg#fighter-striker" />
</svg>
```
For an icon:
```html
<svg viewBox="0 0 24 24" aria-hidden="true">
  <use href="/assets/sentry-sprite-sheet.svg#icon-play" />
</svg>
```
The icon symbols use `currentColor`. Fighter and effect symbols use their brand fills.

## Palette
- Ember: `#F2541B`
- Steel: `#2D62E3`
- Ink: `#1C1B19`
- Paper: `#FAFAF8`
- Muted: `#6F6C66`
