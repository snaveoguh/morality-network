# Style Guide

This guide documents the current visual language across `v2/web` and `v2/extension`.

## Design Principles

1. Newspaper-first information density.
2. Minimal color, strong hierarchy, sharp typography.
3. Opinionated contrasts: editorial paper mode + tactical dark overlays.
4. Fast scan, low ornament, high signal.

## Visual Modes

### A) E-Ink Newspaper (Web default)

Used in feed/proposals/leaderboard shell.

Core tokens from `v2/web/src/app/globals.css`:

- `--paper: #F5F0E8`
- `--paper-dark: #EDE6D6`
- `--ink: #1A1A1A`
- `--ink-light: #4A4A4A`
- `--ink-faint: #8A8A8A`
- `--rule: #2A2A2A`
- `--rule-light: #C8C0B0`
- `--accent-red: #8B0000`

### B) Signal Dark (Extension + interactive panels)

Used in extension tooltip/panel/popup and some governance widgets.

Key colors:

- Background: `#0A0A0A`
- Surface: `#18181B`
- Border: `#27272A`
- Muted text: `#71717A` / `#52525B`
- Primary accent: `#2F80ED`
- Positive: `#31F387`
- Negative: `#D0021B`
- Star: `#FCD34D`

## Typography

Web fonts (from `layout.tsx`):

- Masthead: `UnifrakturCook`
- Headline serif: `Playfair Display`
- Body serif: `Libre Baskerville`
- UI/utility: `Geist Sans`
- Data/labels: `Geist Mono`

Utility classes:

- `.font-masthead`
- `.font-headline`
- `.font-headline-serif`
- `.font-body-serif`
- `.font-mono`

## Layout System

### Newspaper Grid

- Desktop: 6 columns
- Tablet: 4 columns
- Mobile: 1 column
- Dense auto-flow
- Ruled dividers (`--rule-light`) instead of card-heavy shadows

Tile weights:

- `hero`: span 6
- `major`: span 3
- `standard`: span 2
- `minor`: span 2
- `filler`: span 1

### Right Rail

- Fixed-width governance column on large screens
- Collapses cleanly on smaller breakpoints

## Component Patterns

### Navigation

- Mono uppercase labels
- Active state via underline + weight
- Pipe separators (`|`) as structure markers

### Data Chips

- Border-first styling
- Small mono text
- Avoid large rounded-pill color badges in paper mode

### Vote/Odds Bars

- Monochrome bars in paper mode
- Green/red split bars in dark tactical mode (prediction market)

### Ratings

- Star control 1-5
- Optional reason text (`rateWithReason`)
- Keep max reason length bounded in UI

### Comments

- Thread-ready item rows
- Score + vote controls compact and always visible
- Timestamp + short address metadata required

### Tooltips/Overlays (Extension)

- Must never block normal page navigation
- Hover affordances should be informative but not sticky
- Side panel should open via explicit intent only

## Motion

- Marquee ticker: linear continuous scroll, pause on hover
- Feed/odds changes: short transitions (`~150-500ms`)
- Avoid bouncy spring effects in editorial surfaces

## Imagery

- Use grayscale/e-ink filtering for feed imagery
- Preserve source logos/icons for recognition
- Avoid glossy gradients in paper mode

## Accessibility Baseline

- Maintain readable contrast for text and borders
- Keep interactive targets >= 32px where possible
- Preserve keyboard focus states
- Ensure labels exist for icon-only controls

## Content Tone (UI Copy)

- Editorial and direct.
- Short system labels in uppercase mono where useful.
- Avoid marketing-heavy microcopy in core workflows.

## Implementation Rules

1. Reuse existing tokens before introducing new colors.
2. Keep paper mode components token-driven (`var(--*)`).
3. Dark mode widgets must use a tight neutral palette with one primary accent.
4. Add new component variants only when behavior is materially different.

## Anti-Patterns

- Random rainbow accents in paper layouts.
- Over-rounded, mobile-app style cards in every section.
- Hidden critical actions behind hover-only affordances.
- Extension click handlers hijacking standard link behavior.
