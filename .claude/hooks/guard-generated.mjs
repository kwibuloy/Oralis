// PreToolUse (Edit|Write): block hand edits to generated assets.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw || '{}');
const file = String(input.tool_input?.file_path ?? '').replace(/\\/g, '/');
// Paths are matched relative to the repo root, where the app lives.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..').replace(/\\/g, '/');
const rel = file.toLowerCase().startsWith(root.toLowerCase() + '/') ? file.slice(root.length + 1) : file;

const RULES = [
  [/^public\/models\/histology\.glb$/, 'Edit scripts/blender/build_histology.py and re-run it in headless Blender (see .claude/skills/blender-model).'],
  [/^public\/models\/[^/]+\.glb$/, 'Edit GROUPS/MODELS in scripts/extract-bodyparts.mjs and re-run it (see .claude/skills/add-structure).'],
  [/^src\/content\/structures\.generated\.json$/, 'It is written by scripts/extract-bodyparts.mjs (see .claude/skills/add-structure).'],
  [/^models-src\/.+\.blend$/, 'It is saved by scripts/blender/build_histology.py; change the script instead.'],
  [/^models-src\/carving-molar\.glb$/, 'It is built by scripts/build-carving-tooth.mjs; change the script, then re-run it and extract-bodyparts.mjs.'],
  [/^src\/content\/carving\.generated\.json$/, 'Landmark positions come from scripts/build-carving-tooth.mjs; names and notes live in src/content/carving.ts.'],
  [/^models-src\/cariology\.glb$/, 'It is built by scripts/build-cariology.mjs (shapes in scripts/lib/caries-lesions.mjs); change the script, then re-run it and extract-bodyparts.mjs.'],
  [/^src\/content\/cariology(-sites)?\.generated\.json$/, 'Written by scripts/build-cariology.mjs (lesion stages and pins) and extract-bodyparts.mjs (site pins); names and notes live in src/content/cariology.ts.'],
];

const hit = RULES.find(([re]) => re.test(rel));
if (hit) {
  process.stderr.write(`${file} is generated. ${hit[1]}\n`);
  process.exit(2);
}
