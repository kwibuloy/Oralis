---
name: visual-check
description: Look at Oralis in a real browser at phone, tablet and desktop widths before calling a UI or 3D change done. Use after any change to the atlas layout, styles, viewer or models, or when the user asks how something looks.
---

# Visual check

**Phones and tablets are the primary users.** Every UI or 3D change is checked at 390 (phone), 768 (tablet portrait) and 1024 (tablet landscape) as well as 1440, with touch emulated, and touch interactions (tap, drag, swipe, pinch) are tried, not just looked at. A change is not done until it works on phone and tablet.

1. Start the dev server if it is not running (port 5173): the `oralis` entry in `.claude/launch.json`, or `npm run dev` in the background. If 5173 is taken the server moves to another port; pass it as `BASE_URL=http://localhost:<port>/`.
2. Shoot the routes you touched (without the `#/`):

   ```bash
   node scripts/shoot.mjs --widths 1440,1024,768,390 general dental/left-lower-first-secondary-molar-tooth histology/dentin
   ```

   It prints each PNG in `.shots/` and exits non-zero on console errors or horizontal overflow.
3. Open every PNG with Read and describe what you actually see. A passing exit code only means nothing crashed.
4. Check: model fully in frame and clear of the cards, selection glows blue, no camera inside geometry, cards don't collide at 390, 768 or 1024, touch targets are at least 40px, the explode slider at 35% (spread) and 100% (inventory grid) still fits. Drive state in a puppeteer probe through `window.__viewer` (dev only) or by setting `#explode-range`.
5. The design reference is the Human Atlas UI (white canvas, rounded white cards, soft shadows, toggles, F/S/B/T view rail, explode card). Tokens are in `src/styles/base.css`; don't add raw colours in components. For a deeper pass hand off to the `ui-critic` agent.
6. For touch behaviour run `scripts/touch-check.mjs` (below) for each route you touched, and report what happened.
7. Delete `.shots/` when done (git-ignored).

## Selection and card rules (every subject)

These were agreed with the user from phone testing; every new subject and card follows them.

- **Tapping a part flies in to it, never out.** `Viewer.select` frames the part closer (never further than the camera already is) and centres it in the free space between the cards (`Viewer.setInsets`).
- **Description cards use `src/atlas/Sheet.tsx`**, never a bare `<aside className="card detail">`. Sheet reports what it covers to the viewer through the `SheetInset` context.
- **Up to 860px wide (phones, portrait tablets) the card is a bottom sheet that starts as a peek**: colour bar, group and name only, with the part centred above it. This applies to every card: parts, functions, landmarks. The user opens it (tap or swipe up) and hides it (swipe down); it stays as they left it while they pick other things. Text inside scrolls; the rest of the card drags.
- **Wider (tablet landscape, desktop) the card sits on the right**, and the part is framed between the layers card and the card.
- **Check it with touch:** `node scripts/touch-check.mjs <route> --key <structure key>` (a part on the model) or `--tap "<selector>=<text>"` (a list item, e.g. a function name). It runs 390, 768, 1024 and 1440 and fails if any rule above breaks.
- The browser pane pauses animation while it is hidden and scales the phone view, so taps there miss; use the puppeteer scripts. Software WebGL is too slow for camera tweens, so the scripts emulate reduced motion to see where the camera lands.
