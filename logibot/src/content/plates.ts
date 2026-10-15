import type { Region } from '../engine';

/** Historical anatomical plates (Wellcome Collection, CC BY 4.0). Credit every one on the page. */
export interface Plate {
  src: string;
  width: number;
  height: number;
  alt: string;
  title: string;
  page: string;
  region?: Region;
}

const BY4 = 'https://creativecommons.org/licenses/by/4.0/';
export const PLATE_LICENSE = { name: 'CC BY 4.0', url: BY4 };

export const PLATES = {
  muscleMan: {
    src: '/plates/vesalius-muscle-man.webp', width: 1200, height: 1759, region: 'Torso',
    alt: 'Woodcut of a flayed man in profile, arms raised, muscles labelled with letters, standing before classical ruins.',
    title: 'The second muscular tabula, Vesalius, De humani corporis fabrica (1543)',
    page: 'https://commons.wikimedia.org/w/index.php?curid=36354301',
  },
  skeleton: {
    src: '/plates/mouat-skeleton.webp', width: 1200, height: 1925, region: 'Head',
    alt: 'Engraving of two skeletons, one facing forward and one turned away, on a pale page.',
    title: 'Page from An atlas of anatomical plates, F. J. Mouat (1849)',
    page: 'https://commons.wikimedia.org/wiki/File:Page_from_An_atlas_of_anatomical_plates_Wellcome_L0067232.jpg',
  },
  arm: {
    src: '/plates/lairesse-arm.webp', width: 1200, height: 1686, region: 'Arms',
    alt: 'Engraving of the dissected muscles of the shoulder, upper and lower arm, pinned open on a table.',
    title: 'Muscles of the shoulder, upper and lower arm, after G. de Lairesse (1739)',
    page: 'https://commons.wikimedia.org/wiki/File:Muscles_of_the_shoulder,_upper_and_lower_arm._Engraving_afte_Wellcome_V0007748.jpg',
  },
  thigh: {
    src: '/plates/lairesse-thigh.webp', width: 1200, height: 1714, region: 'Legs',
    alt: 'Engraving of a deep dissection of the thigh muscles.',
    title: 'A deep dissection of the muscles of the thigh, after G. de Lairesse (1739)',
    page: 'https://commons.wikimedia.org/wiki/File:A_deep_dissection_of_the_muscles_of_the_thigh._Engraving_aft_Wellcome_V0007761.jpg',
  },
  osteology: {
    src: '/plates/vesalius-osteology.webp', width: 1200, height: 1339,
    alt: 'Woodcut skeleton from Vesalius, leaning in contemplation over a tomb.',
    title: "Osteology from Vesalius' De humani corporis fabrica (1543)",
    page: 'https://commons.wikimedia.org/w/index.php?curid=35874561',
  },
} satisfies Record<string, Plate>;

export const ALL_PLATES: Plate[] = Object.values(PLATES);
