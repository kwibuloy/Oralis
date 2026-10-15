// Load-test POST /api/chat. Start `npm run dev` first, or point at a deployment:
//   BENCH_URL=https://your-app.vercel.app npm run bench
const BASE = process.env.BENCH_URL ?? 'http://localhost:5173';

const CASES = [
  ['Migraine (Head)', { message: 'I have a severe headache with throbbing pain and nausea', bodyPart: 'Head', sex: 'male' }],
  ['Cardiac event (Torso)', { message: 'chest pain shortness of breath sweating rapid heartbeat', bodyPart: 'Torso', sex: 'male' }],
  ['DVT (Legs)', { message: 'swelling in my leg with leg pain and warmth', bodyPart: 'Legs', sex: 'female' }],
  ['Nerve compression (Arm)', { message: 'numbness and weakness in my arm with sharp pain', bodyPart: 'LeftArm', sex: 'male' }],
  ['Menstrual cramps (Torso, female)', { message: 'menstrual cramps pelvic pain back pain', bodyPart: 'Torso', sex: 'female' }],
  ['Redirect (wrong part)', { message: 'chest pain and shortness of breath', bodyPart: 'Head', sex: 'male' }],
  ['Referral (sciatica)', { message: 'pain shooting down my leg and back pain', bodyPart: 'Legs', sex: 'male' }],
  ['Unrecognised', { message: 'I feel a bit off today', bodyPart: 'Head', sex: 'male' }],
];

async function post(payload) {
  const t = performance.now();
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const body = await res.json();
  return { status: res.status, body, ms: performance.now() - t };
}

function stats(times) {
  const s = [...times].sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))].toFixed(2);
  return { avg: (s.reduce((a, b) => a + b, 0) / s.length).toFixed(2), p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s.at(-1).toFixed(2) };
}

async function individual() {
  console.log('\nPer-scenario latency (20 runs each)');
  for (const [name, payload] of CASES) {
    const times = [];
    let engine = 0;
    for (let i = 0; i < 20; i++) {
      const r = await post(payload);
      times.push(r.ms);
      engine += r.body.trace?.elapsedMs ?? 0;
    }
    const s = stats(times);
    console.log(`  ${name.padEnd(34)} avg ${s.avg}ms  p95 ${s.p95}ms  engine ${(engine / 20).toFixed(3)}ms`);
  }
}

async function load(concurrency, total) {
  const times = [];
  let ok = 0, failed = 0, next = 0;
  const t0 = performance.now();
  async function worker() {
    while (next < total) {
      const payload = CASES[next++ % CASES.length][1];
      try {
        const r = await post(payload);
        times.push(r.ms);
        r.status === 200 ? ok++ : failed++;
      } catch { failed++; }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const secs = (performance.now() - t0) / 1000;
  const s = stats(times);
  console.log(`\nLoad: ${concurrency} concurrent, ${total} requests`);
  console.log(`  throughput ${(total / secs).toFixed(1)} req/s  success ${ok}/${total}  failed ${failed}`);
  console.log(`  avg ${s.avg}ms  p50 ${s.p50}ms  p95 ${s.p95}ms  p99 ${s.p99}ms  max ${s.max}ms`);
}

async function multiTurn() {
  const t1 = await post({ message: 'I have a severe headache', bodyPart: 'Head', sex: 'male' });
  const t2 = await post({ message: 'also throbbing pain and nausea', bodyPart: 'Head', sex: 'male', symptoms: t1.body.symptoms });
  const hit = t2.body.reply.matches?.some((m) => m.condition.id === 'Migraine');
  console.log(`\nMulti-turn: turn 1 → ${t1.body.reply.kind}, turn 2 → ${hit ? 'Migraine (pass)' : 'no migraine (FAIL)'}`);
}

async function validation() {
  const cases = [
    [{ bodyPart: 'Head', sex: 'male' }, 400],
    [{ message: 'x', bodyPart: 'Nose', sex: 'male' }, 400],
    [{ message: 'x', bodyPart: 'Head', sex: 'other' }, 400],
    [{ message: 'headache', bodyPart: 'Head', sex: 'male' }, 200],
  ];
  let pass = 0;
  for (const [payload, want] of cases) if ((await post(payload)).status === want) pass++;
  console.log(`Validation: ${pass}/${cases.length} returned the expected status`);
}

try {
  await fetch(`${BASE}/api/chat`);
} catch {
  console.error(`No server at ${BASE}. Run \`npm run dev\` first or set BENCH_URL.`);
  process.exit(1);
}
console.log(`LogiBot benchmark → ${BASE}`);
await individual();
await load(10, 200);
await load(50, 700);
await multiTurn();
await validation();
