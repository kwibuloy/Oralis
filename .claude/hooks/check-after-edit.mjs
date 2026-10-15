// PostToolUse (Edit|Write): after a TS/TSX edit under logibot/, typecheck the
// project and, for content or route changes, run the content tests. Failures
// exit 2 so the errors are fed back to Claude.
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw || '{}');
const file = String(input.tool_input?.file_path ?? input.tool_response?.filePath ?? '').replace(/\\/g, '/');
if (!/logibot\/(src|scripts|vite\.config)\S*\.(ts|tsx)$/.test(file)) process.exit(0);

const app = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'logibot');
const run = (cmd) => {
  try {
    execSync(cmd, { cwd: app, stdio: 'pipe', timeout: 120_000 });
    return null;
  } catch (e) {
    return `${cmd} failed:\n${(e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '')}`.slice(0, 4000);
  }
};

const errors = [run('npx tsc -b --pretty false')];
if (/src\/(content|lib)\//.test(file)) errors.push(run('npx vitest run --reporter=dot'));

const failed = errors.filter(Boolean);
if (failed.length) {
  process.stderr.write(failed.join('\n\n'));
  process.exit(2);
}
