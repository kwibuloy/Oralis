// PreToolUse (Edit|Write): block hand edits to generated assets.
// They are produced by `node scripts/extract-head.mjs` in logibot/.
let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw || '{}');
const file = String(input.tool_input?.file_path ?? '').replace(/\\/g, '/');

const GENERATED = [/logibot\/src\/content\/structures\.generated\.json$/, /logibot\/public\/models\/[^/]+\.glb$/];

if (GENERATED.some((re) => re.test(file))) {
  process.stderr.write(
    `${file} is generated. Change GROUPS in logibot/scripts/extract-head.mjs and re-run ` +
      '`node scripts/extract-head.mjs <human-atlas checkout>` from logibot/ instead (see .claude/skills/add-structure).\n',
  );
  process.exit(2);
}
