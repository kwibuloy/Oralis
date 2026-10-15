---
name: visual-check
description: Look at Oralis in a real browser at desktop and phone widths before calling a UI or 3D change done. Use after any change to the atlas layout, styles, viewer or models, or when the user asks how something looks.
---

# Visual check

1. Start the dev server if it is not running (port 5173): the `logibot` entry in `.claude/launch.json`, or `npm --prefix logibot run dev` in the background.
2. Shoot the routes you touched (without the `#/`):

   ```bash
   cd logibot && node scripts/shoot.mjs --widths 1440,390 general dental/left-lower-first-secondary-molar-tooth histology/dentin
   ```

   It prints each PNG in `.shots/` and exits non-zero on console errors or horizontal overflow.
3. Open every PNG with Read and describe what you actually see. A passing exit code only means nothing crashed.
4. Check: model fully in frame and clear of the cards, selection glows blue, no camera inside geometry, cards don't collide at 390px, the explode slider at 35% (spread) and 100% (inventory grid) still fits. Drive state in a puppeteer probe through `window.__viewer` (dev only) or by setting `#explode-range`.
5. The design reference is the Human Atlas UI (white canvas, rounded white cards, soft shadows, toggles, F/S/B/T view rail, explode card). Tokens are in `logibot/src/styles/base.css`; don't add raw colours in components. For a deeper pass hand off to the `ui-critic` agent.
6. Delete `.shots/` when done (git-ignored).
