/**
 * Study notes for general-anatomy structures, keyed by the BodyParts3D name with
 * "Left"/"Right" removed and lower-cased. Educational summaries, not a textbook:
 * check against your course material.
 */
export interface Note {
  summary: string;
  supply?: string;
  clinical?: string;
}

export const GROUPS: Record<string, { label: string; blurb: string }> = {
  teeth: { label: 'Teeth', blurb: 'The 28 permanent teeth in the model. Third molars are not included in the source data.' },
  gingiva: { label: 'Gingiva', blurb: 'The masticatory mucosa around the necks of the teeth.' },
  mandible: { label: 'Mandible', blurb: 'The lower jaw.' },
  maxilla: { label: 'Maxillae and palatine bones', blurb: 'The upper jaw and the bones of the hard palate.' },
  skull: { label: 'Cranium and facial skeleton', blurb: 'The remaining bones of the skull.' },
  'neck-bones': { label: 'Hyoid and upper cervical spine', blurb: 'The hyoid bone, atlas and axis.' },
  suprahyoid: { label: 'Suprahyoid muscles', blurb: 'Muscles above the hyoid that form the floor of the mouth and help open the jaw.' },
  infrahyoid: { label: 'Infrahyoid and neck muscles', blurb: 'Strap muscles below the hyoid, with the platysma and sternocleidomastoid.' },
  tongue: { label: 'Tongue', blurb: 'The tongue and the extrinsic muscles in the model.' },
  'palate-pharynx': { label: 'Soft palate and pharynx', blurb: 'Muscles of the soft palate and pharyngeal wall, with their ligaments.' },
  glands: { label: 'Salivary glands', blurb: 'The submandibular and sublingual glands. The parotid is not in the source data.' },
  lips: { label: 'Lips', blurb: 'The lips as a surface.' },
};

export const NOTES: Record<string, Note> = {
  mandible: {
    summary: 'The only movable bone of the skull, articulating with both temporal bones at the temporomandibular joints. Its alveolar process carries the 16 lower teeth.',
    supply: 'Inferior alveolar nerve (V3) enters at the mandibular foramen, runs in the mandibular canal and leaves as the mental nerve.',
    clinical: 'The inferior alveolar nerve block targets the mandibular foramen behind the lingula, medial to the ramus. The mental foramen usually sits below the premolar apices.',
  },
  maxilla: {
    summary: 'Paired bone forming the upper jaw, most of the hard palate (palatine process), the floor of the orbit and the lateral nasal wall. Its body holds the maxillary sinus.',
    supply: 'Upper teeth are supplied by the superior alveolar nerves from V2: posterior, middle (when present) and anterior.',
    clinical: 'Upper molar and premolar roots can project into the maxillary sinus; extractions here risk an oroantral communication.',
  },
  'palatine bone': {
    summary: 'L-shaped bone behind the maxilla. Its horizontal plate forms the posterior third of the hard palate.',
    supply: 'Greater and lesser palatine nerves (V2) emerge through the greater and lesser palatine foramina.',
    clinical: 'The greater palatine foramen, usually opposite the second or third molar, is the site of the greater palatine nerve block.',
  },
  'temporal bone': {
    summary: 'Forms the side and base of the skull. Its mandibular fossa and articular eminence form the cranial side of the temporomandibular joint.',
    clinical: 'On wide opening the condyle and articular disc glide forward onto the articular eminence.',
  },
  'sphenoid bone': {
    summary: 'Butterfly-shaped bone at the centre of the skull base. Its pterygoid plates anchor the pterygoid muscles of mastication.',
    supply: 'V2 leaves the skull through the foramen rotundum and V3 through the foramen ovale, both in the greater wing.',
  },
  'zygomatic bone': {
    summary: 'The cheekbone. With the zygomatic process of the temporal bone it forms the zygomatic arch.',
    clinical: 'The masseter arises from the zygomatic arch. The muscle itself is not in the source data.',
  },
  'frontal bone': { summary: 'Forms the forehead and the roofs of the orbits. Contains the frontal sinuses.' },
  'parietal bone': { summary: 'Paired bones forming the roof and upper sides of the cranium; the temporalis fascia attaches along the temporal lines.' },
  'occipital bone': { summary: 'Forms the back of the skull base and contains the foramen magnum; its condyles articulate with the atlas.' },
  ethmoid: { summary: 'Light bone between the orbits forming the upper nasal septum, the upper conchae and the ethmoidal air cells.' },
  vomer: { summary: 'Thin midline bone forming the lower, posterior part of the nasal septum.' },
  'nasal bone': { summary: 'Paired bones forming the bridge of the nose.' },
  'lacrimal bone': { summary: 'The smallest facial bone, in the medial wall of the orbit, housing the lacrimal sac.' },
  'inferior nasal concha': { summary: 'Scroll-shaped bone on the lateral nasal wall. The nasolacrimal duct opens beneath it.' },
  'hyoid bone': {
    summary: 'U-shaped bone at the level of C3 with no bony articulation. Suprahyoid muscles pull it up and forward during swallowing; infrahyoid muscles steady it.',
    clinical: 'A fixed hyoid gives the suprahyoids a base to depress the mandible.',
  },
  atlas: { summary: 'The first cervical vertebra (C1). It has no body; it carries the skull and allows nodding.' },
  axis: { summary: 'The second cervical vertebra (C2). Its dens forms the pivot around which the atlas and head rotate.' },
  'gingiva of upper jaw': {
    summary: 'Keratinised masticatory mucosa around the upper teeth: free gingiva at the margin, attached gingiva bound to bone, ending at the mucogingival junction.',
    clinical: 'A healthy sulcus probes 0.5–3 mm. Bleeding on probing is an early sign of gingivitis.',
  },
  'gingiva of lower jaw': {
    summary: 'Keratinised masticatory mucosa around the lower teeth, continuous with the alveolar mucosa at the mucogingival junction.',
    clinical: 'Attached gingiva is often narrowest around the lower incisors and premolars, where recession is common.',
  },
  digastric: {
    summary: 'Two bellies joined by an intermediate tendon slung to the hyoid. It depresses the mandible and raises the hyoid.',
    supply: 'Anterior belly: nerve to mylohyoid (V3). Posterior belly: facial nerve (VII).',
    clinical: 'The two nerve supplies reflect two embryological origins: the first and second pharyngeal arches.',
  },
  mylohyoid: {
    summary: 'A muscular sheet from the mylohyoid line of the mandible to the hyoid, forming the floor of the mouth.',
    supply: 'Nerve to mylohyoid (V3).',
    clinical: 'Infection from apices above the mylohyoid line (premolars) spreads to the sublingual space; from apices below it (second and third molars), to the submandibular space.',
  },
  geniohyoid: { summary: 'Runs from the inferior genial tubercle to the hyoid, above the mylohyoid. Pulls the hyoid forward and helps open the mouth.', supply: 'C1 fibres travelling with the hypoglossal nerve.' },
  stylohyoid: { summary: 'From the styloid process to the hyoid, splitting around the digastric tendon. Elevates and retracts the hyoid.', supply: 'Facial nerve (VII).' },
  omohyoid: { summary: 'Two-bellied strap muscle from the scapula to the hyoid. Depresses the hyoid.', supply: 'Ansa cervicalis (C1–C3).' },
  sternohyoid: { summary: 'Strap muscle from the sternum to the hyoid. Depresses the hyoid after swallowing.', supply: 'Ansa cervicalis (C1–C3).' },
  thyrohyoid: { summary: 'Short muscle from the thyroid cartilage to the hyoid. Depresses the hyoid or raises the larynx.', supply: 'C1 fibres via the hypoglossal nerve.' },
  platysma: { summary: 'Thin superficial sheet from the chest over the mandible into the lower face. Tenses the neck skin and depresses the corners of the mouth.', supply: 'Cervical branch of the facial nerve (VII).' },
  sternocleidomastoid: { summary: 'Large neck muscle from the sternum and clavicle to the mastoid process. Turns the head to the opposite side.', supply: 'Accessory nerve (XI).', clinical: 'A key landmark for the anterior and posterior triangles of the neck and their lymph nodes.' },
  tongue: {
    summary: 'A muscular organ of taste, speech and swallowing, divided by the terminal sulcus into anterior two-thirds and posterior third.',
    supply: 'Anterior two-thirds: touch by the lingual nerve (V3), taste by the chorda tympani (VII). Posterior third: both by the glossopharyngeal nerve (IX). Motor: hypoglossal (XII), except palatoglossus (X).',
    clinical: 'Lingual nerve anaesthesia commonly accompanies an inferior alveolar nerve block.',
  },
  genioglossus: { summary: 'Fan-shaped extrinsic muscle from the superior genial tubercle into the tongue. Protrudes the tongue.', supply: 'Hypoglossal nerve (XII).', clinical: 'A unilateral XII lesion makes the protruded tongue deviate towards the weak side.' },
  hyoglossus: { summary: 'Quadrilateral extrinsic muscle from the hyoid into the side of the tongue. Depresses and retracts the tongue.', supply: 'Hypoglossal nerve (XII).', clinical: 'The lingual artery passes deep to it; the lingual and hypoglossal nerves lie on its surface.' },
  'levator veli palatini': { summary: 'Elevates the soft palate to close off the nasopharynx during swallowing and speech.', supply: 'Vagus nerve (X) via the pharyngeal plexus.' },
  'tensor veli palatini': { summary: 'Hooks around the pterygoid hamulus to tense the soft palate; also opens the auditory tube.', supply: 'Mandibular nerve (V3).', clinical: 'Swallowing or yawning equalises ear pressure through this muscle.' },
  'uvular muscle': { summary: 'Shortens and lifts the uvula.', supply: 'Vagus nerve (X) via the pharyngeal plexus.', clinical: 'Deviation of the uvula away from one side suggests a vagus nerve lesion on that side.' },
  'superior pharyngeal constrictor': { summary: 'Upper muscle of the pharyngeal wall, partly arising from the pterygomandibular raphe.', supply: 'Vagus nerve (X) via the pharyngeal plexus.' },
  'middle pharyngeal constrictor': { summary: 'Arises from the hyoid and overlaps the superior constrictor.', supply: 'Vagus nerve (X) via the pharyngeal plexus.' },
  'inferior pharyngeal constrictor': { summary: 'Thickest constrictor, from the thyroid and cricoid cartilages.', supply: 'Vagus nerve (X).' },
  palatopharyngeus: { summary: 'Forms the palatopharyngeal arch (posterior pillar of the fauces). Elevates the pharynx in swallowing.', supply: 'Vagus nerve (X).' },
  salpingopharyngeus: { summary: 'From the auditory tube cartilage into the pharyngeal wall. Raises the pharynx.', supply: 'Vagus nerve (X).' },
  stylopharyngeus: { summary: 'From the styloid process into the pharynx. Raises and widens the pharynx in swallowing.', supply: 'Glossopharyngeal nerve (IX), the only muscle it supplies.' },
  'pterygomandibular raphe': {
    summary: 'Tendinous band from the pterygoid hamulus to the mandible, joining the buccinator in front with the superior constrictor behind.',
    clinical: 'Its mucosal fold is the main landmark for the inferior alveolar nerve block: the needle enters just lateral to it.',
  },
  'stylohyoid ligament': { summary: 'Runs from the styloid process to the lesser horn of the hyoid.', clinical: 'Calcification of this ligament (Eagle syndrome) can cause throat or facial pain.' },
  epiglottis: { summary: 'Leaf-shaped elastic cartilage that folds back over the laryngeal inlet during swallowing.' },
  'submandibular gland': {
    summary: 'Mixed, mainly serous gland wrapped around the free edge of the mylohyoid. Produces about two-thirds of unstimulated saliva.',
    supply: 'Secretomotor: chorda tympani (VII) via the submandibular ganglion.',
    clinical: 'Its duct (Wharton’s) opens at the sublingual caruncle beside the lingual frenum, the most common site for salivary stones.',
  },
  'sublingual gland': {
    summary: 'The smallest major salivary gland, mainly mucous, lying under the floor-of-mouth mucosa above the mylohyoid.',
    supply: 'Secretomotor: chorda tympani (VII) via the submandibular ganglion.',
    clinical: 'Many small ducts open along the sublingual fold. A ruptured duct can produce a ranula.',
  },
  lip: { summary: 'The lips close the oral fissure. Orbicularis oris, the muscle inside them, is not in the source data.', clinical: 'The vermilion border is checked in every oral cancer screening.' },
};

export const baseName = (sourceName: string) => sourceName.replace(/^(left|right) /i, '').toLowerCase();
export const noteFor = (sourceName: string): Note | undefined => NOTES[baseName(sourceName)];
