import type { Condition, Edge, Symptom } from './types.js';

/**
 * The knowledge base. Educational, not clinical: every entry is a simplified
 * teaching example. Add a symptom here, reference it from a condition, and
 * the tests in diagnose.test.ts will catch dangling ids.
 */
export const SYMPTOMS: Symptom[] = [
  // Head
  { id: 'severe_headache', label: 'severe headache', regions: ['Head'], keywords: ['severe headache', 'intense headache', 'bad headache', 'terrible headache', 'worst headache'] },
  { id: 'headache', label: 'headache', regions: ['Head'], keywords: ['headache', 'head hurts', 'head pain', 'head ache'] },
  { id: 'throbbing_pain', label: 'throbbing pain', regions: ['Head'], keywords: ['throbbing', 'pulsating', 'pounding pain', 'pounding headache'] },
  { id: 'pressure_band', label: 'band-like pressure', regions: ['Head'], keywords: ['tight band', 'band around my head', 'pressure around my head', 'head pressure', 'dull ache', 'squeezing'] },
  { id: 'dizziness', label: 'dizziness', regions: ['Head'], keywords: ['dizzy', 'dizziness', 'lightheaded', 'light headed', 'vertigo', 'spinning'] },
  { id: 'nausea', label: 'nausea', regions: ['Head', 'Torso'], keywords: ['nausea', 'nauseous', 'feel sick', 'queasy'] },
  { id: 'light_sensitivity', label: 'light sensitivity', regions: ['Head'], keywords: ['light sensitivity', 'photophobia', 'bright lights hurt', 'sensitive to light', 'sensitivity to light', 'light hurts'] },
  { id: 'blurred_vision', label: 'blurred vision', regions: ['Head'], keywords: ['blurred vision', 'blurry', "can't see clearly", 'vision problems', 'double vision'] },
  { id: 'confusion', label: 'confusion', regions: ['Head'], keywords: ['confused', 'confusion', 'disoriented', "can't think clearly"] },
  { id: 'slurred_speech', label: 'slurred speech', regions: ['Head'], keywords: ['slurred speech', "can't speak clearly", 'trouble speaking', 'slurring'] },
  { id: 'facial_pressure', label: 'facial pressure', regions: ['Head'], keywords: ['facial pain', 'face pressure', 'sinus pressure', 'sinus pain', 'pressure behind my eyes', 'face hurts'] },
  { id: 'congestion', label: 'congestion', regions: ['Head'], keywords: ['stuffy nose', 'blocked nose', 'congestion', 'congested', 'runny nose'] },
  { id: 'head_injury', label: 'head injury', regions: ['Head'], keywords: ['hit my head', 'head injury', 'bumped my head', 'fell on my head', 'concussion', 'banged my head'] },
  { id: 'fever', label: 'fever', regions: ['Head', 'Torso'], keywords: ['fever', 'feverish', 'high temperature', 'temperature'] },

  // Torso
  { id: 'chest_pain', label: 'chest pain', regions: ['Torso'], keywords: ['chest pain', 'chest hurts', 'chest discomfort', 'pain in chest', 'pain in my chest', 'chest tightness', 'tight chest'] },
  { id: 'shortness_of_breath', label: 'shortness of breath', regions: ['Torso'], keywords: ['shortness of breath', "can't breathe", 'breathing difficulty', 'hard to breathe', 'short of breath', 'breathless'] },
  { id: 'rapid_heartbeat', label: 'rapid heartbeat', regions: ['Torso'], keywords: ['rapid heartbeat', 'heart racing', 'heart is racing', 'palpitations', 'fast heartbeat', 'heart pounding'] },
  { id: 'sweating', label: 'sweating', regions: ['Torso'], keywords: ['sweating', 'cold sweat', 'sweaty', 'perspiring'] },
  { id: 'back_pain', label: 'back pain', regions: ['Torso'], keywords: ['back pain', 'back hurts', 'pain in back', 'pain in my back', 'backache', 'lower back'] },
  { id: 'neck_stiffness', label: 'neck stiffness', regions: ['Torso'], keywords: ['neck stiffness', 'stiff neck', 'neck is stiff', 'tight neck', 'neck tension', 'neck is really stiff'] },
  { id: 'muscle_tension', label: 'muscle tension', regions: ['Torso'], keywords: ['muscle tension', 'tense muscles', 'muscles are tense', 'tight muscles', 'upper back tension'] },
  { id: 'heartburn', label: 'heartburn', regions: ['Torso'], keywords: ['heartburn', 'burning in my chest', 'acid reflux', 'reflux', 'indigestion'] },
  { id: 'sour_taste', label: 'sour taste', regions: ['Torso'], keywords: ['sour taste', 'bitter taste', 'regurgitation', 'acid in my throat'] },
  { id: 'cough', label: 'cough', regions: ['Torso'], keywords: ['cough', 'coughing', 'phlegm', 'mucus'] },
  { id: 'chills', label: 'chills', regions: ['Torso'], keywords: ['chills', 'shivering', 'shaking with cold'] },
  { id: 'abdominal_pain', label: 'abdominal pain', regions: ['Torso'], keywords: ['stomach ache', 'stomachache', 'stomach pain', 'abdominal pain', 'belly pain', 'stomach hurts', 'tummy ache', 'cramps in my stomach'] },
  { id: 'lower_right_pain', label: 'lower-right abdominal pain', regions: ['Torso'], keywords: ['lower right abdomen', 'right side of my stomach', 'lower right side', 'right lower belly', 'pain near my belly button'] },
  { id: 'loss_of_appetite', label: 'loss of appetite', regions: ['Torso'], keywords: ['loss of appetite', 'no appetite', "don't feel like eating", 'not hungry'] },
  { id: 'vomiting', label: 'vomiting', regions: ['Torso'], keywords: ['vomit', 'vomiting', 'throwing up', 'threw up'] },
  { id: 'diarrhea', label: 'diarrhea', regions: ['Torso'], keywords: ['diarrhea', 'diarrhoea', 'loose stool', 'watery stool'] },
  { id: 'flank_pain', label: 'flank pain', regions: ['Torso'], keywords: ['flank pain', 'pain in my side', 'side pain', 'pain under my ribs', 'kidney pain'] },
  { id: 'blood_in_urine', label: 'blood in urine', regions: ['Torso'], keywords: ['blood in urine', 'blood in my urine', 'pink urine', 'red urine'] },
  { id: 'painful_urination', label: 'painful urination', regions: ['Torso'], keywords: ['painful urination', 'hurts to pee', 'burning when i pee', 'burning urination'] },
  { id: 'menstrual_cramps', label: 'menstrual cramps', regions: ['Torso'], sex: 'female', keywords: ['period cramps', 'menstrual pain', 'cramping', 'menstrual cramps', 'period pain'] },
  { id: 'pelvic_pain', label: 'pelvic pain', regions: ['Torso'], sex: 'female', keywords: ['pelvic pain', 'pain in pelvis', 'pain in my pelvis'] },
  { id: 'breast_tenderness', label: 'breast tenderness', regions: ['Torso'], sex: 'female', keywords: ['breast pain', 'tender breasts', 'breasts hurt', 'swollen breasts', 'boobs hurt', 'boob hurt', 'swollen boobs'] },

  // Arms and legs
  { id: 'numbness', label: 'numbness', regions: ['Arms', 'Legs'], keywords: ['numbness', 'numb', 'pins and needles'] },
  { id: 'tingling', label: 'tingling', regions: ['Arms', 'Legs'], keywords: ['tingling', 'tingly', 'pins and needles', 'prickling'] },
  { id: 'weakness', label: 'weakness', regions: ['Arms', 'Legs'], keywords: ['weakness', 'weak', "can't lift", 'no strength'] },
  { id: 'sharp_pain', label: 'sharp pain', regions: ['Arms'], keywords: ['sharp pain', 'stabbing pain', 'shooting pain'] },
  { id: 'joint_pain', label: 'joint pain', regions: ['Arms'], keywords: ['joint pain', 'elbow pain', 'wrist pain', 'shoulder pain', 'elbow hurts', 'wrist hurts', 'shoulder hurts'] },
  { id: 'pain_on_movement', label: 'pain on movement', regions: ['Arms', 'Legs'], keywords: ['hurts to move', 'pain when moving', 'pain when i move', 'pain when i lift', 'hurts when i move'] },
  { id: 'swelling', label: 'swelling', regions: ['Arms', 'Legs'], keywords: ['swelling', 'swollen', 'puffy', 'edema'] },
  { id: 'trauma', label: 'recent injury', regions: ['Arms', 'Legs'], keywords: ['fell', 'i fell', 'got hit', 'was hit', 'injured', 'injury', 'accident', 'twisted my', 'landed on'] },
  { id: 'bruising', label: 'bruising', regions: ['Arms', 'Legs'], keywords: ['bruise', 'bruised', 'bruising'] },
  { id: 'deformity', label: 'visible deformity', regions: ['Arms', 'Legs'], keywords: ['looks bent', 'deformed', 'out of place', 'bone sticking', 'crooked'] },
  { id: 'muscle_cramps', label: 'muscle cramps', regions: ['Legs'], keywords: ['muscle cramps', 'cramps', 'cramping', 'muscle spasms', 'charley horse'] },
  { id: 'leg_pain', label: 'leg pain', regions: ['Legs'], keywords: ['leg pain', 'pain in leg', 'pain in my leg', 'leg hurts', 'calf pain', 'calf hurts'] },
  { id: 'radiating_leg_pain', label: 'pain radiating down the leg', regions: ['Legs', 'Torso'], keywords: ['shooting down my leg', 'down my leg', 'radiates to my leg', 'radiating down', 'sciatica'] },
  { id: 'warmth', label: 'warmth', regions: ['Legs'], keywords: ['warm', 'warmth', 'hot', 'heat'] },
  { id: 'redness', label: 'redness', regions: ['Legs'], keywords: ['red', 'redness', 'discoloration'] },
  { id: 'toe_pain', label: 'big-toe pain', regions: ['Legs'], keywords: ['big toe', 'toe pain', 'toe hurts', 'toe joint'] },
  { id: 'groin_pain', label: 'groin pain', regions: ['Legs'], keywords: ['groin pain', 'pain in my groin', 'groin hurts', 'inner thigh pain'] },
];

export const CONDITIONS: Condition[] = [
  // Head
  {
    id: 'Migraine', name: 'Migraine', region: 'Head',
    mandatory: ['severe_headache', 'throbbing_pain'], optional: ['nausea', 'light_sensitivity', 'dizziness', 'blurred_vision'], optionalMinimum: 1,
    summary: 'An intense, throbbing headache, often one-sided, lasting 4 to 72 hours and frequently paired with nausea and sensitivity to light or sound.',
  },
  {
    id: 'Stroke', name: 'Stroke warning signs', region: 'Head', urgent: true,
    mandatory: ['severe_headache'], optional: ['dizziness', 'confusion', 'slurred_speech', 'blurred_vision'], optionalMinimum: 2,
    summary: 'Interrupted blood flow to the brain. Sudden severe headache with confusion, slurred speech or vision loss needs emergency care.',
  },
  {
    id: 'TensionHeadache', name: 'Tension headache', region: 'Head',
    mandatory: ['headache', 'pressure_band'], optional: ['light_sensitivity'], optionalMinimum: 0,
    summary: 'The most common headache: a dull, band-like pressure on both sides, usually tied to stress, posture or fatigue.',
  },
  {
    id: 'Sinusitis', name: 'Sinusitis', region: 'Head',
    mandatory: ['facial_pressure'], optional: ['congestion', 'headache', 'fever'], optionalMinimum: 1,
    summary: 'Inflamed sinuses causing pressure behind the eyes and cheeks, congestion, and sometimes a mild fever.',
  },
  {
    id: 'Meningitis', name: 'Possible meningitis', region: 'Head', urgent: true,
    mandatory: ['severe_headache', 'fever'], optional: ['light_sensitivity', 'confusion', 'nausea'], optionalMinimum: 1,
    summary: 'Inflammation of the membranes around the brain. Headache with fever and light sensitivity needs same-day emergency assessment.',
  },
  {
    id: 'Concussion', name: 'Concussion', region: 'Head', urgent: true,
    mandatory: ['head_injury'], optional: ['dizziness', 'confusion', 'nausea', 'headache', 'blurred_vision'], optionalMinimum: 1,
    summary: 'A mild traumatic brain injury. Any symptoms after a blow to the head should be checked by a clinician.',
  },

  // Torso
  {
    id: 'CardiacEvent', name: 'Possible cardiac event', region: 'Torso', urgent: true,
    mandatory: ['chest_pain'], optional: ['shortness_of_breath', 'sweating', 'rapid_heartbeat'], optionalMinimum: 3,
    summary: 'Chest pain with breathlessness, sweating and a racing heart can signal a heart attack and needs immediate attention.',
  },
  {
    id: 'AnxietyAttack', name: 'Anxiety attack', region: 'Torso',
    mandatory: ['shortness_of_breath'], optional: ['rapid_heartbeat', 'chest_pain', 'sweating'], optionalMinimum: 2,
    summary: 'A surge of anxiety producing chest tightness, a racing heart and breathlessness. Frightening, but not life-threatening.',
  },
  {
    id: 'MenstrualCramps', name: 'Menstrual cramps (dysmenorrhea)', region: 'Torso', sex: 'female',
    mandatory: ['menstrual_cramps', 'pelvic_pain'], optional: ['breast_tenderness', 'back_pain'], optionalMinimum: 1,
    summary: 'Pain during menstruation caused by uterine contractions, often felt in the pelvis and lower back.',
  },
  {
    id: 'GERD', name: 'Acid reflux (GERD)', region: 'Torso',
    mandatory: ['heartburn'], optional: ['chest_pain', 'sour_taste', 'cough'], optionalMinimum: 1,
    summary: 'Stomach acid flowing back into the oesophagus, felt as a burning chest and a sour taste, often after meals or lying down.',
  },
  {
    id: 'Pneumonia', name: 'Chest infection (pneumonia)', region: 'Torso',
    mandatory: ['cough', 'fever'], optional: ['shortness_of_breath', 'chest_pain', 'chills'], optionalMinimum: 1,
    summary: 'An infection inflaming the air sacs of the lungs. A cough with fever and breathlessness should be seen by a doctor.',
  },
  {
    id: 'Appendicitis', name: 'Possible appendicitis', region: 'Torso', urgent: true,
    mandatory: ['lower_right_pain'], optional: ['nausea', 'fever', 'loss_of_appetite', 'vomiting'], optionalMinimum: 1,
    summary: 'Inflammation of the appendix. Pain that settles in the lower right abdomen with nausea or fever needs urgent assessment.',
  },
  {
    id: 'Gastroenteritis', name: 'Gastroenteritis', region: 'Torso',
    mandatory: ['abdominal_pain', 'diarrhea'], optional: ['nausea', 'vomiting', 'fever'], optionalMinimum: 1,
    summary: 'A stomach bug inflaming the gut. Usually passes in a few days; the main risk is dehydration.',
  },
  {
    id: 'KidneyStone', name: 'Kidney stone', region: 'Torso',
    mandatory: ['flank_pain'], optional: ['blood_in_urine', 'painful_urination', 'nausea'], optionalMinimum: 1,
    summary: 'A hard deposit moving through the urinary tract, causing waves of severe pain in the side that can spread to the groin.',
  },
  {
    id: 'Sciatica', name: 'Sciatica', region: 'Torso',
    mandatory: ['back_pain', 'radiating_leg_pain'], optional: ['muscle_tension'], optionalMinimum: 0,
    summary: 'Irritation of the sciatic nerve in the lower spine, sending pain from the back down one leg.',
  },

  // Arms
  {
    id: 'NerveCompression', name: 'Nerve compression', region: 'Arms',
    mandatory: ['numbness'], optional: ['weakness', 'sharp_pain', 'tingling'], optionalMinimum: 1,
    summary: 'A pinched nerve, such as carpal tunnel or cervical radiculopathy, causing numbness, tingling and weakness.',
  },
  {
    id: 'Tendinitis', name: 'Tendinitis', region: 'Arms',
    mandatory: ['joint_pain'], optional: ['pain_on_movement', 'swelling'], optionalMinimum: 1,
    summary: 'An inflamed tendon from overuse, sore around the joint and worse when you move it.',
  },
  {
    id: 'ArmFracture', name: 'Possible arm fracture', region: 'Arms', urgent: true,
    mandatory: ['trauma'], optional: ['swelling', 'bruising', 'deformity', 'sharp_pain', 'pain_on_movement'], optionalMinimum: 2,
    summary: 'A broken bone after an injury. Swelling, bruising or a misshapen limb needs an X-ray.',
  },

  // Legs
  {
    id: 'DVT', name: 'Deep vein thrombosis (DVT)', region: 'Legs', urgent: true,
    mandatory: ['swelling', 'leg_pain'], optional: ['warmth', 'redness'], optionalMinimum: 1,
    summary: 'A blood clot in a deep leg vein. It can be life-threatening if it travels to the lungs.',
  },
  {
    id: 'Gout', name: 'Gout', region: 'Legs',
    mandatory: ['toe_pain'], optional: ['swelling', 'redness', 'warmth'], optionalMinimum: 2,
    summary: 'Uric acid crystals in a joint, classically the big toe, causing sudden hot, red, swollen pain.',
  },
  {
    id: 'MuscleCramp', name: 'Muscle cramp', region: 'Legs',
    mandatory: ['muscle_cramps'], optional: ['leg_pain'], optionalMinimum: 0,
    summary: 'A sudden involuntary muscle contraction, often after exercise or dehydration. Stretching usually eases it.',
  },
  {
    id: 'LegFracture', name: 'Possible leg fracture', region: 'Legs', urgent: true,
    mandatory: ['trauma'], optional: ['swelling', 'bruising', 'deformity', 'leg_pain', 'pain_on_movement'], optionalMinimum: 2,
    summary: 'A broken bone after an injury. Inability to bear weight, swelling or deformity needs an X-ray.',
  },
];

export const EDGES: Edge[] = [
  { from: 'Migraine', to: 'Torso', manifests: ['neck_stiffness', 'muscle_tension'], description: 'Migraines commonly cause neck stiffness and upper-back tension through the trigeminal nerve system.' },
  { from: 'Stroke', to: 'Arms', manifests: ['weakness', 'numbness'], description: 'A stroke affecting the motor cortex causes sudden weakness, numbness or paralysis in the arms.' },
  { from: 'Stroke', to: 'Legs', manifests: ['weakness', 'leg_pain'], description: 'A stroke can affect the motor regions controlling the legs, causing sudden weakness.' },
  { from: 'CardiacEvent', to: 'Arms', manifests: ['sharp_pain', 'numbness', 'tingling'], description: 'Cardiac chest pain often radiates to the arms, especially the left, through referred-pain pathways.' },
  { from: 'MenstrualCramps', to: 'Legs', manifests: ['leg_pain', 'muscle_cramps'], description: 'Menstrual cramps can radiate to the thighs because pelvic nerves run close by.' },
  { from: 'NerveCompression', to: 'Torso', manifests: ['back_pain', 'shortness_of_breath'], description: 'Nerve compression in the cervical spine can send symptoms down from the neck and upper back.' },
  { from: 'DVT', to: 'Torso', manifests: ['shortness_of_breath', 'chest_pain', 'rapid_heartbeat'], description: 'A clot from the legs can travel to the lungs as a pulmonary embolism, linking leg symptoms to sudden chest symptoms.' },
  { from: 'Meningitis', to: 'Torso', manifests: ['neck_stiffness', 'fever'], description: 'A stiff neck together with fever is a classic sign of meningeal irritation.' },
  { from: 'KidneyStone', to: 'Legs', manifests: ['groin_pain', 'flank_pain'], description: 'A kidney stone moving down the ureter sends pain from the side into the groin and inner thigh.' },
  { from: 'Sciatica', to: 'Legs', manifests: ['radiating_leg_pain', 'back_pain'], description: 'Sciatica starts at a nerve root in the lower spine; the leg pain is where it is felt, not where it begins.' },
];

export const REGION_PROMPTS: Record<string, string> = {
  Head: 'Is the pain sharp, dull or throbbing? Any changes in your vision, dizziness, nausea, fever or a recent knock to the head?',
  Torso: 'Where exactly: chest, stomach, side or back? Any trouble breathing, a cough, fever, sweating or nausea?',
  Arms: 'Is there numbness, tingling or weakness? Is the pain in a joint, does it shoot down the arm, or did you injure it?',
  Legs: 'Any swelling, warmth or redness? Is the pain in the calf, a joint, or shooting down from your back? Did you injure it?',
};
