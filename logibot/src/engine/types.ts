/** Anatomical regions the engine reasons about. */
export type Region = 'Head' | 'Torso' | 'Arms' | 'Legs';

/** Clickable parts of the 3D model. LeftArm/RightArm both normalise to Arms. */
export type BodyPart = 'Head' | 'Torso' | 'LeftArm' | 'RightArm' | 'Legs';

/** Which anatomical model is loaded; gates sex-specific symptoms and conditions. */
export type Sex = 'male' | 'female';

export const BODY_PARTS: readonly BodyPart[] = ['Head', 'Torso', 'LeftArm', 'RightArm', 'Legs'];
export const REGIONS: readonly Region[] = ['Head', 'Torso', 'Arms', 'Legs'];
export const SEXES: readonly Sex[] = ['male', 'female'];

export interface Symptom {
  id: string;
  label: string;
  /** Phrases matched as whole-word token sequences. */
  keywords: string[];
  /** Regions where this symptom counts as local. */
  regions: Region[];
  sex?: Sex;
}

export interface Condition {
  id: string;
  name: string;
  region: Region;
  sex?: Sex;
  /** Every one must be present: mandatory ⊆ S. */
  mandatory: string[];
  /** At least `optionalMinimum` must be present: |optional ∩ S| ≥ k. */
  optional: string[];
  optionalMinimum: number;
  urgent?: boolean;
  summary: string;
}

/** Directed edge: a condition located in one region manifests symptoms in another. */
export interface Edge {
  from: string;
  to: Region;
  manifests: string[];
  description: string;
}

export interface ConditionRef {
  id: string;
  name: string;
  region: Region;
  urgent: boolean;
  summary: string;
}

export interface Match {
  condition: ConditionRef;
  score: number;
  mandatory: string[];
  optionalMatched: string[];
  alsoAffects: { region: Region; description: string }[];
}

export interface Referral {
  condition: ConditionRef;
  origin: Region;
  trigger: string[];
  description: string;
  hasOriginSymptoms: boolean;
  checkFor: string[];
  score: number;
}

/** One row of the Boolean evaluation shown in the "logic" view. */
export interface TraceRow {
  conditionId: string;
  name: string;
  mandatory: string[];
  mandatoryHeld: boolean;
  optionalHits: string[];
  optionalMinimum: number;
  passed: boolean;
}

export interface Trace {
  extracted: string[];
  accumulated: string[];
  remote: string[];
  rows: TraceRow[];
  edgesChecked: number;
  elapsedMs: number;
}

export type Reply =
  | { kind: 'unrecognized'; lead: string }
  | { kind: 'need_more'; lead: string; known: string[] }
  | { kind: 'redirect'; lead: string; remote: string[]; suggested: Region[] }
  | { kind: 'assessment'; lead: string; urgent: boolean; referrals: Referral[]; matches: Match[] };

export interface DiagnoseInput {
  message: string;
  bodyPart: BodyPart;
  sex: Sex;
  /** Symptom ids accumulated on earlier turns for this body part. */
  symptoms?: string[];
}

export interface DiagnoseOutput {
  reply: Reply;
  /** New accumulated local symptom set; the client sends it back next turn. */
  symptoms: string[];
  trace: Trace;
}
