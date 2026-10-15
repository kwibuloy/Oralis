/** Historical plates for the landing page. Every one is credited in the footer. */
export interface Plate {
  src: string;
  width: number;
  height: number;
  alt: string;
  title: string;
  page: string;
  license: { name: string; url?: string };
}

const BY4 = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };

export const PLATES = {
  foxSkull: {
    src: '/plates/fox-skull.webp', width: 1400, height: 1173, license: BY4,
    alt: 'Engraving of a child’s skull in profile on a book, the jaw cut away to show permanent teeth forming above the milk teeth.',
    title: 'Skull with developing dentition, Joseph Fox, The Natural History of the Human Teeth (1803)',
    page: 'https://commons.wikimedia.org/w/index.php?curid=36040697',
  },
  jaws: {
    src: '/plates/jaws-and-teeth.webp', width: 1400, height: 1840, license: BY4,
    alt: 'Line engraving of ten figures: a lower jaw seen from above, single teeth and fragments of the upper jaw.',
    title: 'Skull and jaw bones, with teeth: ten figures, line engraving (1771)',
    page: 'https://commons.wikimedia.org/w/index.php?curid=36440329',
  },
  encyclopedie: {
    src: '/plates/encyclopedie-teeth.webp', width: 1180, height: 1837, license: BY4,
    alt: 'Plate with two rows of extracted adult teeth and the base of a skull seen from below.',
    title: 'Teeth, skull and patella, plate from the Encyclopédie',
    page: 'https://commons.wikimedia.org/wiki/File:Teeth,_skull_and_patella_(knee_cap),_the_latter_after_Clopto_Wellcome_V0007833ER.jpg',
  },
  skullBones: {
    src: '/plates/skull-bones.webp', width: 1400, height: 900, license: BY4,
    alt: 'Ink and watercolour drawing of seven separated bones of the skull, including the maxilla and palatine bone, each labelled.',
    title: 'Bones of the skull: seven figures, ink and watercolour',
    page: 'https://commons.wikimedia.org/wiki/File:Bones_of_the_skull;_seven_figures._Ink_and_watercolour,_afte_Wellcome_V0008220.jpg',
  },
  cosmos: {
    src: '/plates/dental-cosmos.webp', width: 1400, height: 1721, license: { name: 'no known copyright restrictions' },
    alt: 'Engraving of a magnified ring-shaped tissue section with layered, hatched bands.',
    title: 'Figure from The Dental Cosmos (1890)',
    page: 'https://commons.wikimedia.org/wiki/File:The_Dental_cosmos_(1890)_(14592580960).jpg',
  },
} satisfies Record<string, Plate>;

export const ALL_PLATES: Plate[] = Object.values(PLATES);
