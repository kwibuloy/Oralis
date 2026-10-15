// PostToolUse (Edit|Write): after a TS/TSX edit in the app (repo root), typecheck the
// project and, for content or route changes, run the content tests. Failures
// exit 2 so the errors are fed back to Claude.
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw || '{}');
const file = String(input.tool_input?.file_path ?? input.tool_response?.filePath ?? '').replace(/\\/g, '/');
const app = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const root = app.replace(/\\/g, '/').toLowerCase();
const rel = file.toLowerCase().startsWith(root + '/') ? file.slice(root.length + 1) : '';
if (!/^(src|scripts)\/\S*\.(ts|tsx)$|^vite\.config\.ts$/.test(rel)) process.exit(0);
const run = (cmd) => {
  try {
    execSync(cmd, { cwd: app, stdio: 'pipe', timeout: 120_000 });
    return null;
  } catch (e) {
    return `${cmd} failed:\n${(e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '')}`.slice(0, 4000);
  }
};

const errors = [run('npx tsc -b --pretty false')];
if (/^src\/(content|lib)\//.test(rel)) errors.push(run('npx vitest run --reporter=dot'));

const failed = errors.filter(Boolean);
if (failed.length) {
  process.stderr.write(failed.join('\n\n'));
  process.exit(2);
}
