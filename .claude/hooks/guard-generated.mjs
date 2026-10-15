// PreToolUse (Edit|Write): block hand edits to generated assets.
let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw || '{}');
const file = String(input.tool_input?.file_path ?? '').replace(/\\/g, '/');

const RULES = [
  [/logibot\/public\/models\/histology\.glb$/, 'Edit scripts/blender/build_histology.py and re-run it in headless Blender (see .claude/skills/blender-model).'],
  [/logibot\/public\/models\/[^/]+\.glb$/, 'Edit GROUPS/MODELS in scripts/extract-bodyparts.mjs and re-run it (see .claude/skills/add-structure).'],
  [/logibot\/src\/content\/structures\.generated\.json$/, 'It is written by scripts/extract-bodyparts.mjs (see .claude/skills/add-structure).'],
  [/logibot\/models-src\/.+\.blend$/, 'It is saved by scripts/blender/build_histology.py; change the script instead.'],
];

const hit = RULES.find(([re]) => re.test(file));
if (hit) {
  process.stderr.write(`${file} is generated. ${hit[1]}\n`);
  process.exit(2);
}
