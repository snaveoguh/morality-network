# Cambridge Roof Exchange Homepage Redesign Prototype

This folder contains a standalone homepage prototype built for Cambridge Roof Exchange. It is intended as a polished visual handoff and implementation reference for the production site.

## Files

- `index.html`: full responsive homepage prototype
- `styles.css`: standalone stylesheet with the full visual system

## Preview Locally

From the workspace root:

```bash
cd designs/cambridge-roof-exchange-homepage
python3 -m http.server 4321
```

Then open:

- `http://127.0.0.1:4321`

## What Is Included

- Tiled hero media wall designed for drone clips
- High-intent survey form directly in the hero
- Rewritten homepage structure and copy
- Service, process, case-study, compliance, and final CTA sections
- Sticky mobile call-to-action bar

## Media Notes

The current prototype uses live public CRE assets that were already available on the production site:

- `https://crex.lon1.cdn.digitaloceanspaces.com/media-files/aldi_2-v2.mp4`
- `https://crex.lon1.cdn.digitaloceanspaces.com/media-files/aldi.png`
- `https://crex.lon1.cdn.digitaloceanspaces.com/init/misc/about-2.png`

To improve the hero immediately, replace the duplicated demo tiles in `index.html` with the best drone clips from recent projects. The hero grid is already structured for 6 media slots.

## Recommended Production Integration

- Port the layout into the live stack rather than iframe-ing or embedding this file directly.
- Replace the prototype form button behavior with the real contact / CRM submission.
- Use the strongest 5 to 8 drone clips as `video` tiles with still-image posters.
- Keep the desktop hero form above the fold.
- Preserve reduced-motion behavior by swapping video tiles for stills when needed.

## Content Grounding

The copy and structure are based on the live CRE site content and public case-study details, especially around:

- Industrial and commercial refurbishment
- Asbestos removal
- Overcladding
- Thermal and building-envelope upgrades
- ISO / NFRC / SafeContractor trust signals
