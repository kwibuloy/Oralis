import { diagnose } from '../src/engine/diagnose.js';
import { parseRequest } from '../src/engine/validate.js';

/**
 * POST /api/chat — stateless. The client holds the accumulated symptom set
 * and sends it back each turn, so any serverless instance can answer.
 * Served by Vercel in production and by the Vite dev middleware locally.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body must be valid JSON.' }, { status: 400 });
  }
  const parsed = parseRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  return Response.json(diagnose(parsed.input));
}

export function GET(): Response {
  return Response.json({ status: 'ok', usage: 'POST { message, bodyPart, sex, symptoms? }' });
}
