# Vendored skills

`taste-skill/` and `redesign-skill/` are copied unmodified (MIT, see each LICENSE) from
https://github.com/leonxlnx/taste-skill at commit f624f37 (2026-10-15). The skill's `evals/`
folder was left out. To update, re-copy `skills/taste-skill` and `skills/redesign-skill`.

Gate for this repo (run from the repo root, dev server on :5173):

    node .claude/skills/taste-skill/scripts/lint.mjs src
    node .claude/skills/taste-skill/scripts/inspect.mjs http://localhost:5173/ --out .shots/inspect

Current result: lint clean; inspect 0 FAIL, 1 WARN (`no-footage`, defended: the live 3D model is the
moving picture and no honest dental clip exists in the open collections).
