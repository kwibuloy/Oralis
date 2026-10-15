import type { ModeId } from './modes';

/** Every subject in the picker. Subjects whose id is a ModeId open the 3D atlas; the rest are planned. */
export type SubjectId =
  | ModeId
  | 'anaphy' | 'physiology' | 'occlusion'
  | 'biochem' | 'orgchem' | 'genetics'
  | 'microbio' | 'pathology' | 'cariology';

export interface Subject {
  id: SubjectId;
  name: string;
  group: SubjectGroup;
  /** What the model will show, for the coming-soon screen. */
  planned: string;
}

export const SUBJECT_GROUPS = ['Anatomy', 'Physiology', 'Chemistry & genetics', 'Micro, histo & path', 'Dental'] as const;
export type SubjectGroup = (typeof SUBJECT_GROUPS)[number];

export const SUBJECTS: Subject[] = [
  { id: 'general', name: 'General anatomy', group: 'Anatomy', planned: 'Full skeleton, muscles, and the head and neck with nerves and vessels.' },
  { id: 'dental', name: 'Oral anatomy', group: 'Anatomy', planned: 'Skull with maxilla and mandible, the oral cavity, individual teeth, and a carving tooth with all five surfaces labelled.' },
  { id: 'anaphy', name: 'Anatomy & physiology', group: 'Anatomy', planned: 'The body models with a Structure / Function toggle, such as a heart showing blood flow.' },
  { id: 'physiology', name: 'General physiology', group: 'Physiology', planned: 'A beating heart with the conduction system lit, the lungs, and a kidney nephron.' },
  { id: 'occlusion', name: 'Oral physiology & occlusion', group: 'Physiology', planned: 'Upper and lower arches that open and close, contact points, jaw movement and the TMJ.' },
  { id: 'biochem', name: 'Biochemistry', group: 'Chemistry & genetics', planned: 'Glucose, amino acids, and an enzyme binding its substrate, from PDB structures.' },
  { id: 'orgchem', name: 'Organic chemistry', group: 'Chemistry & genetics', planned: 'Ball-and-stick molecules, functional groups, and the monomers of dental materials.' },
  { id: 'genetics', name: 'Genetics', group: 'Chemistry & genetics', planned: 'The DNA double helix, a chromosome, and a replication / transcription animation.' },
  { id: 'microbio', name: 'Microbiology', group: 'Micro, histo & path', planned: 'Streptococcus mutans and other bacteria, virus shapes, and a biofilm.' },
  { id: 'histology', name: 'General & oral histology', group: 'Micro, histo & path', planned: 'Layered tissue blocks: enamel, dentin, pulp and periodontal ligament.' },
  { id: 'pathology', name: 'Pathology', group: 'Micro, histo & path', planned: 'Healthy and diseased tissue side by side: an ulcer, a cyst, a tumour.' },
  { id: 'cariology', name: 'Cariology', group: 'Dental', planned: 'A tooth with a slider from white-spot lesion through enamel and dentin to the pulp.' },
];

export const subjectById = (id: string) => SUBJECTS.find((s) => s.id === id);
