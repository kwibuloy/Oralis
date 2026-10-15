---
name: visual-check
description: Look at Oralis in a real browser at desktop and phone widths before calling a UI or 3D change done. Use after any change to the landing page, atlas layout, styles, viewer or models, or when the user asks how something looks.
---

# Visual check

1. Start the dev server if it is not running (port 5173): the `logibot` entry in `.claude/launch.json`, or `npm --prefix logibot run dev` in the background.
2. Shoot the routes you touched (without the `#/`; `home` is the landing page):

   ```bash
   cd logibot && node scripts/shoot.mjs --widths 1440,390 home dental dental/left-lower-first-secondary-molar-tooth
   ```

   It prints each PNG in `.shots/` and exits non-zero on console errors or horizontal overflow.
3. Open every PNG with Read and describe what you actually see. A passing exit code only means nothing crashed.
4. For the 3D modes check: model fully in frame, selection visible in gold, no camera inside geometry, controls not covering the model. In dev, `window.__viewer` exposes the camera for numeric probing.
5. For the landing page run the taste-skill gate from the repo root and fix every FAIL:
   `node .claude/skills/taste-skill/scripts/lint.mjs logibot/src` and
   `node .claude/skills/taste-skill/scripts/inspect.mjs http://localhost:5173/ --out logibot/.shots/inspect`.
   The only accepted WARN is `no-footage` (see `.claude/skills/VENDORED.md`). For a deeper pass hand off to the `ui-critic` agent.
6. Delete `.shots/` when done (it is git-ignored).
