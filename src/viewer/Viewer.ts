import { gsap } from 'gsap';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { addSurface, type SurfaceStyle } from './surface';

export type { SurfaceStyle };

const SELECT = new THREE.Color('#2563eb');
const SELECT_MIX = 0.22;
const SELECT_GLOW = new THREE.Color('#1d4ed8').multiplyScalar(0.32);
const HOVER_GLOW = new THREE.Color('#2563eb').multiplyScalar(0.12);
const NO_GLOW = new THREE.Color(0x000000);
/**
 * Vertical projection shift as a fraction of canvas height (positive moves the model up). The cards
 * above and below the model are about the same height on desktop; on phones the header and picker
 * take more room at the top, so the model moves down a little.
 */
const SHIFT_DESKTOP = 0;
const SHIFT_PHONE = -0.04;

/** Flow pulses: wavelength along the network (model units, cm), pulses per loop and loop length. */
const FLOW_WAVELENGTH = 6;
const FLOW_BANDS = 4;
const LOOP_SECONDS = 3;
const PULL_COLOUR = new THREE.Color('#f59e0b');
/** One full auto-rotate turn. */
const AUTO_ROTATE_SECONDS = 25;

/** Room around a fitted model for the cards over the canvas (picker above, explode card below). */
const FIT_PADDING = 1.35;
/** A selected part fills about half the free height; small parts still show this share of the whole model around them. */
const SELECT_PADDING = 1.9;
const SELECT_CONTEXT = 0.12;

export type View = 'front' | 'side' | 'back' | 'top' | 'bottom';
const VIEW_DIR: Record<View, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0.08, 1),
  side: new THREE.Vector3(1, 0.08, 0),
  back: new THREE.Vector3(0, 0.08, -1),
  top: new THREE.Vector3(0, 1, 0.001),
  bottom: new THREE.Vector3(0, -1, 0.001),
};

/** A numbered marker pinned to a point on a part (in that part's local coordinates). */
export interface Pin {
  id: string;
  label: string;
  title: string;
  position: [number, number, number];
  normal: [number, number, number];
  /** The part this pin sits on, when not the one passed to setPins. */
  key?: string;
}

/** Pixels of each canvas edge hidden behind cards. */
export interface Insets {
  left: number;
  right: number;
  bottom: number;
}

export interface Pickable {
  key: string;
  group: string;
  color: string;
  /** Painted just off another part's surface (e.g. a lesion on a tooth): drawn over it without flicker. */
  overlay?: boolean;
  /** Procedural texture and finish (see surface.ts). */
  surface?: SurfaceStyle;
  /**
   * Depth priority where parts overlap on the same plane (e.g. zones on a cut face): higher draws
   * behind lower. 0 or absent: no offset.
   */
  layer?: number;
}

type PartMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

/**
 * Parts that look alike (same material settings and vertex attributes) are drawn together in one
 * BatchedMesh: a handful of draw calls instead of one per part (General anatomy has 2,234 parts).
 * Each part keeps its own visibility, colour and position in the batch. A part that needs special
 * drawing (faded context, the selection, the hovered part) is hidden in its batch and drawn on its own
 * with its own material instead.
 */
interface Batch {
  mesh: THREE.BatchedMesh;
  parts: PartMesh[]; // by instance id
  flowOn?: { value: number };
  /** A see-through batch for faded context parts (built when parts first fade). */
  faded?: boolean;
}

interface PartState {
  base: THREE.Vector3; // position as authored
  center: THREE.Vector3; // bounding-box centre in the authored pose
  size: THREE.Vector3;
  bite: THREE.Vector3; // current "open bite" style offset
  radial: THREE.Vector3; // explode direction at 100% of the spread phase
  grid: THREE.Vector3 | null; // offset that places the part in the inventory grid
}

/**
 * Framework-free three.js viewer shared by every mode. React owns state and
 * calls this imperative API; this class never imports React or content.
 *
 * Meshes are registered with a structure `key` and a `group`. Visibility,
 * context (faded) groups, selection, hover, isolation, offsets and the
 * explode/inventory layout are all expressed in those terms.
 */
export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  private controls: OrbitControls;
  private root = new THREE.Group();
  private meshes: PartMesh[] = [];
  private batches: Batch[] = [];
  private state = new Map<PartMesh, PartState>();
  private modelCenter = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private down: { x: number; y: number } | null = null;
  private frame = 0;
  private needsRender = true;
  private resizeObserver: ResizeObserver;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  private visible = new Set<string>();
  private context = new Set<string>();
  private filter: (key: string) => boolean = () => true;
  private selected: string | null = null;
  private hovered: string | null = null;
  private isolated = false;
  private explode = 0;
  private gridDirty = true;
  private colourOverride: Map<string, string> | null = null;
  // Animated flow: one clock shared by every flow material, 0..1 per loop.
  private flowTime = { value: 0 };
  private playing = false;
  private speed = 1;
  private lastTick = 0;
  private lastFrame = performance.now();
  private lastTimeReport = 0;
  private pull: THREE.Group | null = null;
  // Pins are DOM buttons over the canvas, moved after each render so they stay tappable on phones.
  private pinLayer: HTMLDivElement;
  private flying = false;
  // Canvas edges (px) covered by cards: the phone bottom sheet, or the detail card on the right and
  // the layers card on the left. The projection centre moves into the free space between them.
  private inset: Insets = { left: 0, right: 0, bottom: 0 };
  private insetTarget: Insets = { left: 0, right: 0, bottom: 0 };
  private width = 1;
  private height = 1;
  private pins: { el: HTMLButtonElement; mesh: PartMesh; local: THREE.Vector3; normal: THREE.Vector3 }[] = [];

  onPick: (key: string | null) => void = () => {};
  onPinPick: (id: string) => void = () => {};
  /** Playback position (0..1), reported about ten times a second while playing. */
  onTime: (t: number) => void = () => {};
  onHover: (key: string | null, at: { x: number; y: number } | null) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    this.scene.add(this.root);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4cc, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(4, 7, 9);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xf2f5ff, 0.9);
    fill.position.set(-7, 2, -4);
    this.scene.add(fill);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.screenSpacePanning = true;
    // Wheel and pinch zoom towards the pointer / the midpoint of the two fingers, not the orbit centre.
    this.controls.zoomToCursor = true;
    // OrbitControls turns 2π/60 × speed radians per second when given elapsed time: 60 / 2.4 = one turn per 25 s.
    this.controls.autoRotateSpeed = 60 / AUTO_ROTATE_SECONDS;
    this.controls.addEventListener('change', () => (this.needsRender = true));

    canvas.addEventListener('pointerdown', this.handleDown);
    canvas.addEventListener('pointerup', this.handleUp);
    canvas.addEventListener('pointermove', this.handleMove);
    canvas.addEventListener('pointerleave', this.handleLeave);
    this.pinLayer = document.createElement('div');
    this.pinLayer.className = 'pins';
    (canvas.parentElement ?? document.body).append(this.pinLayer);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.loop();
  }

  /**
   * Load a Draco-compressed GLB; `describe` maps a node name to its structure, or null to drop it.
   * `onProgress` gets bytes downloaded and the total (null when the server sends no length).
   */
  async loadGLB(url: string, describe: (nodeName: string) => Pickable | null, onProgress?: (loaded: number, total: number | null) => void): Promise<void> {
    const draco = new DRACOLoader().setDecoderPath('/draco/');
    const gltf = await new GLTFLoader().setDRACOLoader(draco)
      .loadAsync(url, (e) => onProgress?.(e.loaded, e.lengthComputable && e.total ? e.total : null));
    draco.dispose();
    gltf.scene.updateMatrixWorld(true);
    const add: [THREE.Mesh, Pickable][] = [];
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const info = describe(mesh.name) ?? describe(mesh.parent?.name ?? '');
      if (info) add.push([mesh, info]);
    });
    for (const [mesh, info] of add) this.register(mesh, info);
    this.buildBatches();

    const all = new THREE.Box3();
    for (const m of this.meshes) all.expandByObject(m);
    all.getCenter(this.modelCenter);
    for (const [, s] of this.state) {
      const d = s.center.clone().sub(this.modelCenter);
      // Spread outward, with a floor so parts near the centre still move.
      s.radial = d.multiplyScalar(0.9).add(d.clone().normalize().multiplyScalar(all.getSize(new THREE.Vector3()).length() * 0.06));
    }
    this.apply();
    this.place();
    this.frameAll();
  }

  setVisibleGroups(groups: Iterable<string>, context: Iterable<string> = []) {
    this.visible = new Set(groups);
    this.context = new Set(context);
    this.gridDirty = true;
    this.apply();
    this.place();
  }

  /** Further restrict visibility with a predicate on structure key (e.g. one arch). */
  setFilter(fn: (key: string) => boolean) {
    this.filter = fn;
    this.gridDirty = true;
    this.apply();
    this.place();
  }

  /** Select a part and fly to it: closer in on the part, never further out than the camera already is. */
  select(key: string | null, { frame = true } = {}) {
    this.selected = key;
    this.apply();
    if (key && frame) this.frameKeys([key], SELECT_PADDING, undefined, 1, { context: SELECT_CONTEXT, closerOnly: true });
  }

  /** Tell the viewer how much of each canvas edge cards cover (0 when none); the view slides to keep framed parts clear of them. */
  setInsets(insets: Insets) {
    const to = { left: Math.max(0, Math.round(insets.left)), right: Math.max(0, Math.round(insets.right)), bottom: Math.max(0, Math.round(insets.bottom)) };
    const t = this.insetTarget;
    if (Math.abs(to.left - t.left) < 2 && Math.abs(to.right - t.right) < 2 && Math.abs(to.bottom - t.bottom) < 2) return;
    this.insetTarget = to;
    gsap.killTweensOf(this.inset);
    if (this.reduced) { Object.assign(this.inset, to); this.resize(); return; }
    gsap.to(this.inset, { ...to, duration: 0.35, ease: 'power3.out', onUpdate: () => this.resize() });
  }

  setIsolated(on: boolean) {
    this.isolated = on;
    this.gridDirty = true;
    this.apply();
    this.place();
    if (this.selected) this.frameKeys(on ? [this.selected] : this.visibleKeys(), on ? 1.5 : FIT_PADDING);
  }

  /** Move every part whose key passes `match` by `offset` (e.g. open the bite). Animated. */
  setOffset(match: (key: string) => boolean, offset: THREE.Vector3Like) {
    for (const [m, s] of this.state) {
      const to = match(m.userData.key) ? new THREE.Vector3().copy(offset) : new THREE.Vector3();
      if (this.reduced) s.bite.copy(to);
      else gsap.to(s.bite, { x: to.x, y: to.y, z: to.z, duration: 0.8, ease: 'power3.inOut', onUpdate: () => this.place() });
    }
    this.place();
  }

  /**
   * 0 = assembled, 0.5 = fully spread around the centre, 1 = every visible part
   * laid out side by side in an inventory grid.
   */
  setExplode(t: number) {
    this.explode = Math.min(Math.max(t, 0), 1);
    this.place();
  }

  /** Refit the camera to what is visible now, keeping the current viewing direction. */
  fit(duration = 0.6) {
    this.frameKeys(this.visibleKeys(), FIT_PADDING, undefined, duration);
  }

  /** Look from a named view, or from any direction (e.g. a tooth surface). */
  setView(view: View | THREE.Vector3Like) {
    const dir = typeof view === 'string' ? VIEW_DIR[view].clone() : new THREE.Vector3().copy(view).normalize();
    this.frameKeys(this.visibleKeys(), FIT_PADDING, dir);
  }

  /** Pin numbered markers to points on the part with `key` (or each pin's own key); an empty list removes them. */
  setPins(key: string | null, pins: Pin[]) {
    for (const p of this.pins) p.el.remove();
    this.pins = [];
    for (const pin of pins) {
      const k = pin.key ?? key;
      const mesh = k ? this.meshes.find((m) => m.userData.key === k) : undefined;
      if (!mesh) continue;
      const el = document.createElement('button');
      el.className = 'pin is-hidden'; // shown by placePins once placed (and once the camera lands)
      el.textContent = pin.label;
      el.title = pin.title;
      el.setAttribute('aria-label', `${pin.label}. ${pin.title}`);
      el.dataset.id = pin.id;
      el.addEventListener('click', () => this.onPinPick(pin.id));
      this.pinLayer.append(el);
      this.pins.push({ el, mesh, local: new THREE.Vector3(...pin.position), normal: new THREE.Vector3(...pin.normal) });
    }
    this.needsRender = true;
  }

  setActivePin(id: string | null) {
    for (const p of this.pins) p.el.classList.toggle('is-active', p.el.dataset.id === id);
  }

  setAutoRotate(on: boolean) {
    this.controls.autoRotate = on;
  }

  /** Fit the camera to the visible parts. */
  frameAll(direction = new THREE.Vector3(0.35, 0.15, 1)) {
    this.frameKeys(this.visibleKeys(), FIT_PADDING, direction, 0);
  }

  /** Replace part colours by key (e.g. oxygenation, brain areas); null restores the group colours. */
  setColourOverrides(colours: Map<string, string> | null) {
    this.colourOverride = colours;
    this.apply();
  }

  /** Show flow pulses on these keys (only parts whose model carries flow data respond). */
  setFlowKeys(keys: Set<string> | null) {
    for (const m of this.meshes) {
      const on = m.userData.flowOn as { value: number } | undefined;
      if (on) on.value = keys?.has(m.userData.key) ? 1 : 0;
    }
    // A batch pulses when any of its parts does (parts not pulsing are the hidden ones).
    for (const b of this.batches) if (b.flowOn) b.flowOn.value = b.parts.some((m) => keys?.has(m.userData.key)) ? 1 : 0;
    this.needsRender = true;
  }

  setPlaying(on: boolean) {
    this.playing = on;
    this.lastTick = performance.now();
  }

  setSpeed(speed: number) {
    this.speed = speed;
  }

  /** Jump the flow clock (0..1 of a loop). */
  setTime(t: number) {
    this.flowTime.value = ((t % 1) + 1) % 1;
    this.needsRender = true;
  }

  /**
   * Show a muscle's line of pull: arrows at both ends of its long axis pointing inwards, because a
   * muscle shortens and draws its attachments together. Null removes it.
   */
  setPullArrows(key: string | null) {
    if (this.pull) { this.pull.removeFromParent(); this.pull.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } }); this.pull = null; }
    const mesh = key ? this.meshes.find((m) => m.userData.key === key) : undefined;
    if (!mesh) { this.needsRender = true; return; }
    const axis = principalAxis(mesh.geometry);
    const length = axis.end.distanceTo(axis.start);
    const r = Math.max(length * 0.035, 0.15);
    const material = new THREE.MeshBasicMaterial({ color: PULL_COLOUR, depthTest: false, transparent: true, opacity: 0.95 });
    const group = new THREE.Group();
    const dir = axis.end.clone().sub(axis.start).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, length * 0.7, 12), material);
    shaft.position.copy(axis.start).lerp(axis.end, 0.5);
    shaft.quaternion.setFromUnitVectors(up, dir);
    group.add(shaft);
    for (const [at, towards] of [[axis.start, dir], [axis.end, dir.clone().negate()]] as const) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, r * 2.6, 16), material.clone());
      cone.position.copy(at).addScaledVector(towards, r * 1.3);
      cone.quaternion.setFromUnitVectors(up, towards);
      group.add(cone);
    }
    group.traverse((o) => { o.renderOrder = 10; });
    mesh.add(group);
    this.pull = group;
    this.needsRender = true;
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.pinLayer.remove();
    this.canvas.removeEventListener('pointerdown', this.handleDown);
    this.canvas.removeEventListener('pointerup', this.handleUp);
    this.canvas.removeEventListener('pointermove', this.handleMove);
    this.canvas.removeEventListener('pointerleave', this.handleLeave);
    for (const [m, s] of this.state) { gsap.killTweensOf(s.bite); m.geometry.dispose(); m.material.dispose(); }
    for (const b of this.batches) { b.mesh.dispose(); (b.mesh.material as THREE.Material).dispose(); }
    this.controls.dispose();
    this.renderer.dispose();
  }

  // ---------- internals ----------

  /** The material for a part (or, opaque, for a batch of parts that look alike). */
  private makeMaterial(info: Pickable, vertexColours: boolean, opaque: boolean) {
    const options: THREE.MeshPhysicalMaterialParameters = {
      color: vertexColours || opaque ? '#ffffff' : info.color, roughness: info.surface?.roughness ?? (info.group === 'teeth' || info.group === 'enamel' ? 0.3 : 0.6), metalness: 0,
      side: THREE.DoubleSide, transparent: !opaque, vertexColors: vertexColours,
      ...(info.overlay ? { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 } : {}),
      // A tiny constant offset only: enough to settle coincident walls, never enough to push a part behind another.
      ...(info.layer ? { polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: info.layer } : {}),
    };
    // A clearcoat (enamel's gloss) needs the physical material; everything else stays standard.
    const material = info.surface?.clearcoat
      ? new THREE.MeshPhysicalMaterial({ ...options, clearcoat: info.surface.clearcoat, clearcoatRoughness: 0.18 })
      : new THREE.MeshStandardMaterial(options);
    if (info.surface) addSurface(material, info.surface);
    return material;
  }

  private register(mesh: THREE.Mesh, info: Pickable) {
    // A part with its own vertex colours (e.g. a tooth with a lesion painted on) shows them as they are.
    const vertexColours = !!mesh.geometry.getAttribute('color');
    const material = this.makeMaterial(info, vertexColours, false);
    (mesh.material as THREE.Material).dispose();
    const m = mesh as unknown as PartMesh;
    m.material = material;
    // Bake the world transform so offsets and framing live in one space.
    m.matrixWorld.decompose(m.position, m.quaternion, m.scale);
    m.removeFromParent();
    m.userData = { key: info.key, group: info.group, base: new THREE.Color(vertexColours ? '#ffffff' : info.color), info, vertexColours };
    if (m.geometry.getAttribute('_flow')) m.userData.flowOn = addFlow(material, this.flowTime);
    // Parts are drawn through their batch; a part only joins the scene itself when drawn specially.
    this.meshes.push(m);
    const box = new THREE.Box3().setFromObject(m);
    this.state.set(m, {
      base: m.position.clone(), center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()),
      bite: new THREE.Vector3(), radial: new THREE.Vector3(), grid: null,
    });
  }

  /** Group parts that look alike into batches (see Batch); `faded` builds see-through ones for context parts. */
  private buildBatches(parts = this.meshes, faded = false) {
    const groups = new Map<string, PartMesh[]>();
    for (const m of parts) {
      const { info, vertexColours } = m.userData as { info: Pickable; vertexColours: boolean };
      const attrs = Object.entries(m.geometry.attributes).map(([n, a]) => `${n}:${a.itemSize}:${a.normalized}`).sort().join();
      const sig = JSON.stringify([info.surface ?? null, !!info.overlay, info.layer ?? 0, m.material.roughness, vertexColours, attrs, !!m.geometry.index]);
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig)!.push(m);
    }
    for (const parts of groups.values()) {
      const first = parts[0];
      const vertices = parts.reduce((t, m) => t + m.geometry.getAttribute('position').count, 0);
      const indices = parts.reduce((t, m) => t + (m.geometry.index?.count ?? 0), 0);
      const material = this.makeMaterial(first.userData.info as Pickable, first.userData.vertexColours as boolean, !faded);
      if (faded) { material.opacity = 0.18; material.depthWrite = false; }
      const mesh = new THREE.BatchedMesh(parts.length, vertices, indices, material);
      mesh.sortObjects = false; // opaque: no per-frame depth sort (faded parts are too faint to need one)
      if (faded) mesh.renderOrder = 1;
      const batch: Batch = { mesh, parts: [], faded };
      if (first.geometry.getAttribute('_flow')) batch.flowOn = addFlow(material, this.flowTime);
      for (const m of parts) {
        const id = mesh.addInstance(mesh.addGeometry(m.geometry));
        batch.parts[id] = m;
        m.userData[faded ? 'fadedBatch' : 'batch'] = batch;
        m.userData[faded ? 'fadedInstance' : 'instance'] = id;
        if (faded) mesh.setMatrixAt(id, m.matrixWorld);
      }
      this.root.add(mesh);
      this.batches.push(batch);
    }
  }

  private shown(m: PartMesh): boolean {
    const { key, group } = m.userData as { key: string; group: string };
    if (!this.filter(key)) return false;
    if (this.isolated && this.selected) return key === this.selected;
    return this.visible.has(group) || this.context.has(group) || key === this.selected;
  }

  private visibleKeys() {
    const shown = this.meshes.filter((m) => this.shown(m));
    return (shown.length ? shown : this.meshes).map((m) => m.userData.key as string);
  }

  private apply() {
    const colour = new THREE.Color();
    const isFaded = (m: PartMesh) => this.context.has(m.userData.group) && !this.visible.has(m.userData.group) && m.userData.key !== this.selected;
    // Parts fading for the first time get a see-through batch.
    const newlyFaded = this.meshes.filter((m) => !m.userData.fadedBatch && isFaded(m) && this.shown(m));
    if (newlyFaded.length) this.buildBatches(newlyFaded, true);
    for (const m of this.meshes) {
      const { key, base, batch, instance, fadedBatch, fadedInstance } = m.userData as { key: string; base: THREE.Color; batch: Batch; instance: number; fadedBatch?: Batch; fadedInstance?: number };
      const shown = this.shown(m);
      m.visible = shown;
      const faded = isFaded(m);
      const override = this.colourOverride?.get(key);
      colour.copy(base);
      if (override) colour.set(override);
      // In the see-through batch when faded; drawn on its own (with its own material, for the glow)
      // when selected or hovered; otherwise in its batch.
      const special = shown && !faded && (key === this.selected || key === this.hovered);
      batch.mesh.setVisibleAt(instance, shown && !special && !faded);
      batch.mesh.setColorAt(instance, colour);
      if (fadedBatch) {
        fadedBatch.mesh.setVisibleAt(fadedInstance!, shown && faded);
        fadedBatch.mesh.setColorAt(fadedInstance!, colour);
      }
      if (special && m.parent !== this.root) this.root.add(m);
      if (!special && m.parent) m.removeFromParent();
      if (!special) continue;
      m.material.opacity = 1;
      m.material.depthWrite = true;
      // Keep each tissue's own hue readable; selection adds a blue glow rather than recolouring.
      const c = m.material.color.copy(colour);
      if (key === this.selected) c.lerp(SELECT, SELECT_MIX);
      m.material.emissive.copy(key === this.selected ? SELECT_GLOW : key === this.hovered ? HOVER_GLOW : NO_GLOW);
    }
    this.needsRender = true;
  }

  /** Shelf-pack the visible parts into rows on the front plane, grouped and largest first. */
  private layoutGrid() {
    const parts = this.meshes.filter((m) => this.shown(m)).map((m) => [m, this.state.get(m)!] as const);
    parts.sort(([a, sa], [b, sb]) => String(a.userData.group).localeCompare(String(b.userData.group)) || sb.size.y - sa.size.y);
    const gap = Math.max(...parts.map(([, s]) => Math.max(s.size.x, s.size.y)), 1) * 0.12;
    const area = parts.reduce((t, [, s]) => t + (s.size.x + gap) * (s.size.y + gap), 0);
    const rowWidth = Math.sqrt(area * 1.7);
    let x = 0, y = 0, rowH = 0;
    const cells: [PartState, number, number][] = [];
    for (const [, s] of parts) {
      if (x > 0 && x + s.size.x > rowWidth) { x = 0; y -= rowH + gap; rowH = 0; }
      cells.push([s, x + s.size.x / 2, y - s.size.y / 2]);
      x += s.size.x + gap;
      rowH = Math.max(rowH, s.size.y);
    }
    const width = Math.max(...cells.map(([s, cx]) => cx + s.size.x / 2), 0);
    const height = -Math.min(...cells.map(([s, , cy]) => cy - s.size.y / 2), 0);
    for (const s of this.state.values()) s.grid = null;
    for (const [s, cx, cy] of cells) {
      const target = new THREE.Vector3(this.modelCenter.x + cx - width / 2, this.modelCenter.y + cy + height / 2, this.modelCenter.z);
      s.grid = target.sub(s.center);
    }
    this.gridDirty = false;
  }

  /** Recompute every part position from base + bite + explode. */
  private place() {
    const t = this.explode;
    if (t > 0.5 && this.gridDirty) this.layoutGrid();
    const spread = Math.min(t / 0.5, 1);
    const ease = (x: number) => x * x * (3 - 2 * x);
    const g = t > 0.5 ? ease((t - 0.5) / 0.5) : 0;
    for (const [m, s] of this.state) {
      const p = m.position.copy(s.base).add(s.bite).addScaledVector(s.radial, ease(spread));
      if (g > 0 && s.grid) p.lerp(s.base.clone().add(s.grid), g);
      m.updateMatrixWorld();
      const { batch, instance, fadedBatch, fadedInstance } = m.userData as { batch: Batch; instance: number; fadedBatch?: Batch; fadedInstance?: number };
      batch.mesh.setMatrixAt(instance, m.matrixWorld);
      fadedBatch?.mesh.setMatrixAt(fadedInstance!, m.matrixWorld);
    }
    this.needsRender = true;
  }

  private frameKeys(keys: string[], padding: number, direction?: THREE.Vector3, duration = 1, { context = 0.7, closerOnly = false } = {}) {
    const box = new THREE.Box3();
    const set = new Set(keys);
    for (const m of this.meshes) if (set.has(m.userData.key)) box.expandByObject(m);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const size = box.getSize(new THREE.Vector3());
    // Never frame tighter than a share of everything visible, so small parts keep their surroundings.
    if (!this.isolated) {
      const all = new THREE.Box3();
      for (const m of this.meshes) if (m.visible) all.expandByObject(m);
      if (!all.isEmpty()) {
        sphere.radius = Math.max(sphere.radius, all.getBoundingSphere(new THREE.Sphere()).radius * context);
        size.max(all.getSize(new THREE.Vector3()).multiplyScalar(context));
      }
    }
    const current = this.camera.position.clone().sub(this.controls.target);
    const dir = (direction ?? (current.lengthSq() > 1e-6 ? current : new THREE.Vector3(0.35, 0.15, 1))).clone().normalize();
    // Fit the box as seen from this direction rather than its bounding sphere, so tall models (a
    // whole body) fill a narrow phone screen instead of shrinking to fit a sphere around them.
    const fromAbove = Math.abs(dir.y) > 0.7;
    const halfH = (fromAbove ? size.z : size.y) / 2;
    const halfW = (fromAbove ? size.x : Math.abs(dir.z) * size.x + Math.abs(dir.x) * size.z) / 2;
    const halfD = (fromAbove ? size.y : Math.abs(dir.x) * size.x + Math.abs(dir.z) * size.z) / 2;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    // Only the space between the cards is free. A narrow gap (tablet landscape) still gets a close
    // view: the padding keeps the part itself inside the gap while its surroundings pass behind the cards.
    const freeH = Math.max(0.3, 1 - this.insetTarget.bottom / this.height);
    const freeW = Math.max(0.45, 1 - (this.insetTarget.left + this.insetTarget.right) / this.width);
    const fit = Math.max(halfH / (tan * freeH), halfW / (tan * this.camera.aspect * freeW)) + halfD;
    const distance = closerOnly && current.length() > 1e-3 ? Math.min(fit * padding, current.length()) : fit * padding;
    const to = sphere.center.clone().add(dir.multiplyScalar(distance));
    // Close enough to inspect a single tooth even when the whole body is framed.
    this.controls.minDistance = Math.max(sphere.radius * 0.01, 0.5);
    this.controls.maxDistance = Math.max(distance * 4, 60, this.controls.maxDistance);
    this.camera.near = Math.max(distance / 100, 0.05);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();

    const d = this.reduced ? 0 : duration;
    if (!d) {
      this.controls.target.copy(sphere.center);
      this.camera.position.copy(to);
      this.needsRender = true;
      return;
    }
    gsap.to(this.controls.target, { x: sphere.center.x, y: sphere.center.y, z: sphere.center.z, duration: d, ease: 'power3.inOut' });
    // Pins wait for the camera to land, then fade in (see placePins).
    this.flying = true;
    gsap.to(this.camera.position, { x: to.x, y: to.y, z: to.z, duration: d, ease: 'power3.inOut', onUpdate: () => void (this.needsRender = true),
      onComplete: () => { this.flying = false; this.needsRender = true; } });
  }

  private pick(e: PointerEvent): string | null {
    const rect = this.canvas.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    // The solid batches (their hidden parts are skipped) and the parts drawn on their own; faded parts can't be picked.
    const targets: THREE.Object3D[] = [...this.batches.filter((b) => !b.faded).map((b) => b.mesh), ...this.meshes.filter((m) => m.parent && m.visible)];
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    const batch = this.batches.find((b) => b.mesh === hit.object);
    return ((batch ? batch.parts[hit.batchId ?? -1] : hit.object)?.userData.key as string) ?? null;
  }

  private handleDown = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY }; };

  /** Tap = press and release within 6px; anything further is an orbit drag. */
  private handleUp = (e: PointerEvent) => {
    if (!this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (moved <= 6) this.onPick(this.pick(e));
  };

  private handleMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || this.down) return;
    const key = this.pick(e);
    const rect = this.canvas.getBoundingClientRect();
    this.onHover(key, key ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
    if (key === this.hovered) return;
    this.hovered = key;
    this.canvas.style.cursor = key ? 'pointer' : 'grab';
    this.apply();
  };

  private handleLeave = () => {
    this.hovered = null;
    this.onHover(null, null);
    this.apply();
  };

  /** Move each pin over its point; hide pins on hidden parts or on the far side of the part. */
  private placePins() {
    if (!this.pins.length) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    const world = new THREE.Vector3(), toCamera = new THREE.Vector3(), normal = new THREE.Vector3();
    for (const p of this.pins) {
      p.mesh.localToWorld(world.copy(p.local));
      normal.copy(p.normal).transformDirection(p.mesh.matrixWorld);
      toCamera.copy(this.camera.position).sub(world).normalize();
      const facing = p.mesh.visible && normal.dot(toCamera) > 0.05;
      world.project(this.camera);
      p.el.style.transform = `translate(${((world.x + 1) / 2) * width}px, ${((1 - world.y) / 2) * height}px) translate(-50%, -50%)`;
      p.el.classList.toggle('is-hidden', this.flying || !facing || world.z > 1);
    }
  }

  private resize() {
    const box = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect();
    if (!box.width || !box.height) return;
    this.renderer.setSize(box.width, box.height, false);
    this.camera.aspect = box.width / box.height;
    // Shift the projection so the model centres in the space between the top and bottom cards.
    this.width = box.width;
    this.height = box.height;
    const shiftX = Math.round((this.inset.right - this.inset.left) / 2);
    const shift = Math.round(box.height * (box.width > 860 ? SHIFT_DESKTOP : SHIFT_PHONE) + this.inset.bottom / 2);
    this.camera.setViewOffset(box.width, box.height, shiftX, shift, box.width, box.height);
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  /** Render on demand: only while something changes, controls damp or the model auto-rotates. */
  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const now = performance.now();
    // Pass elapsed seconds so auto-rotate runs at the same speed on 60 Hz and 120 Hz screens.
    const moving = this.controls.update(Math.min((now - this.lastFrame) / 1000, 0.25));
    this.lastFrame = now;
    if (this.playing) {
      this.flowTime.value = (this.flowTime.value + ((now - this.lastTick) / 1000 / LOOP_SECONDS) * this.speed) % 1;
      this.lastTick = now;
      this.needsRender = true;
      if (now - this.lastTimeReport > 100) { this.lastTimeReport = now; this.onTime(this.flowTime.value); }
    }
    if (moving || this.needsRender || this.controls.autoRotate || gsap.globalTimeline.getChildren().length) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
      this.placePins();
    }
  };
}

/**
 * Patch a standard material so the `_flow` vertex attribute (signed distance along the part's
 * network, baked by scripts/lib/flow.mjs) drives travelling bright pulses. Returns the on/off uniform.
 */
function addFlow(material: THREE.MeshStandardMaterial, time: { value: number }) {
  const on = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlowTime = time;
    shader.uniforms.uFlowOn = on;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _flow;\nvarying float vFlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = _flow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFlowTime;\nuniform float uFlowOn;\nvarying float vFlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // Sharp leading edge, fading tail; the sign of vFlow sets the direction of travel.
        float flowPhase = vFlow / ${FLOW_WAVELENGTH.toFixed(1)} - uFlowTime * ${FLOW_BANDS.toFixed(1)};
        totalEmissiveRadiance += uFlowOn * pow(fract(flowPhase), 6.0) * vec3(0.85);`);
  };
  material.customProgramCacheKey = () => 'flow';
  return on;
}

/** Long axis of a mesh (local space): principal component of its vertices, clipped to their extent. */
function principalAxis(geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute('position');
  const mean = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) mean.add(new THREE.Vector3().fromBufferAttribute(pos, i));
  mean.divideScalar(pos.count);
  const c = [0, 0, 0, 0, 0, 0]; // xx xy xz yy yz zz
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(mean);
    c[0] += v.x * v.x; c[1] += v.x * v.y; c[2] += v.x * v.z; c[3] += v.y * v.y; c[4] += v.y * v.z; c[5] += v.z * v.z;
  }
  // Power iteration for the dominant eigenvector of the covariance matrix.
  const axis = new THREE.Vector3(1, 1, 1).normalize();
  for (let k = 0; k < 32; k++) {
    axis.set(c[0] * axis.x + c[1] * axis.y + c[2] * axis.z, c[1] * axis.x + c[3] * axis.y + c[4] * axis.z, c[2] * axis.x + c[4] * axis.y + c[5] * axis.z).normalize();
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const t = v.fromBufferAttribute(pos, i).sub(mean).dot(axis);
    lo = Math.min(lo, t); hi = Math.max(hi, t);
  }
  return { start: mean.clone().addScaledVector(axis, lo), end: mean.clone().addScaledVector(axis, hi) };
}
