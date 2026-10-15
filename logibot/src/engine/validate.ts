import { SYMPTOMS } from './data.js';
import { BODY_PARTS, SEXES, type BodyPart, type DiagnoseInput, type Sex } from './types.js';

const KNOWN = new Set(SYMPTOMS.map((s) => s.id));
export const MAX_MESSAGE = 500;

export type Parsed = { ok: true; input: DiagnoseInput } | { ok: false; error: string };

/** Validate an untrusted /api/chat body. Unknown symptom ids are dropped, not rejected. */
export function parseRequest(body: unknown): Parsed {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be a JSON object.' };
  const { message, bodyPart, sex, symptoms } = body as Record<string, unknown>;
  if (typeof message !== 'string' || !message.trim()) return { ok: false, error: 'message is required.' };
  if (message.length > MAX_MESSAGE) return { ok: false, error: `message must be ${MAX_MESSAGE} characters or fewer.` };
  if (!BODY_PARTS.includes(bodyPart as BodyPart)) return { ok: false, error: `bodyPart must be one of ${BODY_PARTS.join(', ')}.` };
  if (!SEXES.includes(sex as Sex)) return { ok: false, error: 'sex must be male or female.' };
  if (symptoms !== undefined && !Array.isArray(symptoms)) return { ok: false, error: 'symptoms must be an array.' };
  return {
    ok: true,
    input: {
      message: message.trim(),
      bodyPart: bodyPart as BodyPart,
      sex: sex as Sex,
      symptoms: (symptoms ?? []).filter((s): s is string => typeof s === 'string' && KNOWN.has(s)).slice(0, 64),
    },
  };
}
