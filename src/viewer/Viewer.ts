import { gsap } from 'gsap';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { acceleratedRaycast, type MeshBVH } from 'three-mesh-bvh';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';
import { addSurface, type SurfaceStyle, ZONE_SLOTS } from './surface';

export type { SurfaceStyle };

// A frame that stalls (a buffer upload, a garbage collection) counts as one ordinary frame for the
// camera tweens, so a fly-in slows for a moment instead of jumping ahead.
gsap.ticker.lagSmoothing(80, 16);

const SELECT = new THREE.Color('#2563eb');
const SELECT_MIX = 0.22;
const SELECT_CUT_MIX = 0.55;
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
/** Depth-buffer steps between draw layers. Neighbouring tissue zones overlap on a cut face, and a few steps are lost to rounding at grazing angles (white streaks); 150 per layer is not. */
const LAYER_UNITS = 150;

interface Batch {
  mesh: THREE.BatchedMesh;
  /** Has parts to draw in the current view. */
  drawn?: boolean;
  /** Its shader is still linking (drawn once ready). */
  linking?: boolean;
  /** Prepared ahead of use: kept in the next frame (with nothing to draw) so its buffers reach the GPU. */
  uploading?: boolean;
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
  at: THREE.Vector3; // position last written to the batches (NaN until first placed)
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
  private raycaster = Object.assign(new THREE.Raycaster(), { firstHitOnly: true }); // with a BVH: the nearest hit only
  private down: { x: number; y: number } | null = null;
  private frame = 0;
  private needsRender = true;
  private compiling = false;
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
  // Spot focus (see setSpotFocus): the size framed around a tapped point or pin, and the point the next
  // selection flies to.
  private spotSize = 0;
  private spot: THREE.Vector3 | null = null;

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

    for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, this.noteInput, { capture: true, passive: true });
    // Registered before OrbitControls' own wheel handler can run (capture phase), so it can stop a zoom.
    canvas.addEventListener('wheel', this.guardWheel, { capture: true, passive: false });
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
  /**
   * `heavy`: a model whose parts run to hundreds of thousands of triangles (Cariology). Its selection
   * shaders are linked while loading and its parts get a spatial index for picking, built in a worker:
   * a tap otherwise linked a shader (0.85 s) and tested every triangle of the big parts (0.3 s) mid-flight.
   */
  async loadGLB(url: string, describe: (nodeName: string) => Pickable | null, onProgress?: (loaded: number, total: number | null) => void, { heavy = false } = {}): Promise<void> {
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
    this.compiling = true; // no drawing until the shaders are built (see compileAsync below)
    for (const [mesh, info] of add) this.register(mesh, info);
    // Batches are built (and uploaded to the GPU) only for parts as they are first shown: apply() below
    // builds the opening view's. Cariology holds 9.7 M triangles, of which one view shows about 1.5 M;
    // uploading all of it at once froze the page for seconds after the model appeared.

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
    // Link the shaders in parallel, off the main thread. Drawing first would block on each program in turn
    // (1.5 s of frozen page in Cariology on a laptop, several times that on a phone).
    await this.renderer.compileAsync(this.scene, this.camera).catch(() => {});
    if (heavy) await this.linkSelectionShaders();
    // Draw once while the loading card still covers the canvas: the first draw uploads every batch's
    // buffers (tens of MB in Cariology), which otherwise stalls the opening camera flight.
    this.renderer.render(this.scene, this.camera);
    this.compiling = false;
    this.needsRender = true;
    this.prepareRest();
    if (heavy) void this.indexForPicking();
  }

  /**
   * A selected or hovered part is drawn on its own, with a material unlike its batch's: link one of each
   * kind now, in parallel and off the main thread, so the first tap doesn't wait on a shader.
   */
  private async linkSelectionShaders() {
    const kinds = new Map<string, PartMesh>();
    for (const m of this.meshes) {
      const { info, vertexColours } = m.userData as { info: Pickable; vertexColours: boolean };
      const attrs = Object.keys(m.geometry.attributes).sort().join();
      kinds.set(JSON.stringify([info.surface ?? null, !!info.overlay, info.layer ?? 0, vertexColours, attrs]), m);
    }
    const stage = new THREE.Group();
    stage.visible = true;
    for (const m of kinds.values()) {
      const proxy = new THREE.Mesh(m.geometry, m.material);
      proxy.frustumCulled = false;
      stage.add(proxy);
    }
    await this.renderer.compileAsync(stage, this.camera, this.scene).catch(() => {});
  }

  /**
   * Give each part a BVH so a tap or hover tests a handful of triangles, not all of a part's hundreds of
   * thousands. Built in a worker, one part at a time, largest shown parts first; a part is skipped by
   * picking (and kept in its batch) while its buffers are away in the worker.
   */
  private async indexForPicking() {
    const worker = new GenerateMeshBVHWorker();
    this.bvhWorker = worker;
    const size = (m: PartMesh) => m.geometry.index?.count ?? 0;
    try {
      for (;;) {
        if (this.disposed) break;
        const todo = this.meshes.filter((m) => m.userData.batch && !m.geometry.boundsTree && m.parent !== this.root);
        if (!todo.length) {
          if (this.meshes.every((m) => m.geometry.boundsTree)) break;
          await new Promise((r) => setTimeout(r, 500)); // the rest are batched later (prepareRest)
          continue;
        }
        todo.sort((a, b) => Number(b.visible) - Number(a.visible) || size(b) - size(a));
        const m = todo[0];
        m.userData.indexing = true;
        // Indirect: the triangle order is kept, so the part's batch and its own draw stay valid.
        const bvh = (await worker.generate(m.geometry, { indirect: true }).catch(() => null)) as MeshBVH | null;
        if (!bvh) { m.userData.indexing = false; break; } // no worker: picking tests triangles as before
        m.geometry.boundsTree = bvh;
        m.raycast = acceleratedRaycast;
        m.userData.indexing = false;
        if (m.userData.key === this.selected || m.userData.key === this.hovered) this.apply();
      }
    } finally {
      worker.dispose();
      this.bvhWorker = null;
    }
  }

  /**
   * Build and upload the parts not shown yet a few at a time while the page is idle, so the first visit
   * to another lesion stage or view finds them on the GPU (built on demand, a new stage stalled 300 ms).
   */
  private prepareRest() {
    // Only when the page is idle (no forced deadline), and only once the opening camera flight is over.
    // Nor within 1.5 s of a tap, click, key or wheel anywhere on the page: one unchanged part is up to 840 k
    // triangles, and preparing it as the user switched views stalled that switch.
    const busy = () => this.flying || this.playing || performance.now() - this.lastInput < 1500;
    const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(() => (busy() ? setTimeout(() => idle(fn), 300) : fn())) : setTimeout(fn, 50));
    const step = () => {
      if (this.disposed) return;
      const chunk: PartMesh[] = [];
      let triangles = 0;
      for (const m of this.meshes) {
        if (m.userData.batch) continue;
        chunk.push(m);
        triangles += (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3;
        if (triangles > 120_000) break;
      }
      if (!chunk.length) return;
      const before = this.batches.length;
      this.buildBatches(chunk);
      for (const b of this.batches.slice(before)) b.uploading = true;
      this.apply();
      idle(step);
    };
    setTimeout(() => idle(step), 2500);
  }

  /** The colour of each zone's cut faces, by the index baked into the model (_zone). */
  setZonePalette(colours: string[]) {
    colours.slice(0, ZONE_SLOTS).forEach((c, i) => this.zonePalette.value[i].set(c));
    this.needsRender = true;
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
    const spot = this.spot;
    this.spot = null;
    if (key && frame) {
      if (spot) this.frameSpot(spot);
      else this.frameKeys([key], SELECT_PADDING, undefined, 1, { context: SELECT_CONTEXT, closerOnly: true });
    }
  }

  /**
   * Taps and pins fly to the point tapped (or the pin), framing `size` (model units) around it, instead
   * of to the middle of the part: for big parts with small details, such as a sectioned tooth. 0: off.
   */
  setSpotFocus(size: number) {
    this.spotSize = size;
  }

  /** Before a pick: remember where it was, and fly there now if the part is already selected (no select follows). */
  private focusSpot(point: THREE.Vector3, key: string | null) {
    if (!this.spotSize || !key) return;
    if (key === this.selected) this.frameSpot(point);
    else this.spot = point.clone();
  }

  private frameSpot(point: THREE.Vector3) {
    const half = new THREE.Vector3().setScalar(this.spotSize / 2);
    this.frameBox(new THREE.Box3(point.clone().sub(half), point.clone().add(half)), 1, undefined, 1, { context: 0, closerOnly: true });
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
    // One tween for all moving parts, one place() per frame (a tween per part, each calling place(),
    // cost parts² per frame: a stalled fly-in when Cariology opened its arches).
    gsap.killTweensOf(this.biteTween);
    const moves: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
    for (const [m, s] of this.state) {
      const to = match(m.userData.key) ? new THREE.Vector3().copy(offset) : new THREE.Vector3();
      if (!s.bite.equals(to)) moves.push([s.bite, s.bite.clone(), to]);
    }
    if (this.reduced || !moves.length) { for (const [bite, , to] of moves) bite.copy(to); this.place(); return; }
    this.biteTween.t = 0;
    gsap.to(this.biteTween, { t: 1, duration: 0.8, ease: 'power3.inOut', onUpdate: () => {
      for (const [bite, from, to] of moves) bite.lerpVectors(from, to, this.biteTween.t);
      this.place();
    } });
  }
  private biteTween = { t: 0 };
  private frameNear = 0.1;
  private disposed = false;
  /** Colours of `cutZone` cut faces (see setZonePalette). */
  private zonePalette = { value: Array.from({ length: ZONE_SLOTS }, () => new THREE.Color()) };
  private bvhWorker: GenerateMeshBVHWorker | null = null;
  private lastInput = 0;
  private noteInput = () => { this.lastInput = performance.now(); };

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
      el.addEventListener('click', () => {
        const p = this.pins.find((x) => x.el === el);
        if (p) this.focusSpot(this.pinMesh(p).localToWorld(p.local.clone()), p.mesh.userData.key as string);
        this.onPinPick(pin.id);
      });
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
    this.disposed = true;
    this.bvhWorker?.dispose();
    for (const type of ['pointerdown', 'keydown', 'wheel']) window.removeEventListener(type, this.noteInput, { capture: true });
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.pinLayer.remove();
    this.canvas.removeEventListener('wheel', this.guardWheel, { capture: true });
    this.canvas.removeEventListener('pointerdown', this.handleDown);
    this.canvas.removeEventListener('pointerup', this.handleUp);
    this.canvas.removeEventListener('pointermove', this.handleMove);
    this.canvas.removeEventListener('pointerleave', this.handleLeave);
    gsap.killTweensOf(this.biteTween);
    for (const [m] of this.state) { m.geometry.dispose(); m.material.dispose(); }
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
      ...(info.layer ? { polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: info.layer * LAYER_UNITS } : {}),
    };
    // A clearcoat (enamel's gloss) needs the physical material; everything else stays standard.
    const material = info.surface?.clearcoat
      ? new THREE.MeshPhysicalMaterial({ ...options, clearcoat: info.surface.clearcoat, clearcoatRoughness: 0.18 })
      : new THREE.MeshStandardMaterial(options);
    material.userData.cutTint = { value: new THREE.Vector4(0, 0, 0, 0) }; // (a Vector4 defaults to w = 1: a full tint)
    if (info.surface) addSurface(material, info.surface, this.zonePalette, material.userData.cutTint);
    addCaps(material);
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
      bite: new THREE.Vector3(), radial: new THREE.Vector3(), grid: null, at: new THREE.Vector3(NaN, NaN, NaN),
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
        mesh.setMatrixAt(id, m.matrixWorld);
      }
      this.root.add(mesh);
      this.batches.push(batch);
    }
  }

  private isFaded(m: PartMesh): boolean {
    return this.context.has(m.userData.group) && !this.visible.has(m.userData.group) && m.userData.key !== this.selected;
  }

  private shown(m: PartMesh): boolean {
    const { key, group } = m.userData as { key: string; group: string };
    if (!this.filter(key)) return false;
    const inView = (g: string) => this.visible.has(g) || this.context.has(g);
    // A selected part shows even when its group is hidden (e.g. found by search), unless its key is split
    // over several meshes (a tissue's fixed part and each stage's patch) and some are in view: then only those.
    const selected = key === this.selected && (inView(group) || !this.meshes.some((m) => m.userData.key === key && inView(m.userData.group as string)));
    if (this.isolated && this.selected) return selected;
    return inView(group) || selected;
  }

  private visibleKeys() {
    const shown = this.meshes.filter((m) => this.shown(m));
    return (shown.length ? shown : this.meshes).map((m) => m.userData.key as string);
  }

  private apply() {
    const colour = new THREE.Color();
    const isFaded = (m: PartMesh) => this.isFaded(m);
    // Parts fading for the first time get a see-through batch.
    const unbatched = this.meshes.filter((m) => !m.userData.batch && this.shown(m));
    if (unbatched.length) this.buildBatches(unbatched);
    const newlyFaded = this.meshes.filter((m) => !m.userData.fadedBatch && isFaded(m) && this.shown(m));
    if (newlyFaded.length) {
      const before = this.batches.length;
      this.buildBatches(newlyFaded, true);
      // Their see-through material is a new shader: link it off the main thread and draw the batch once
      // it is ready, instead of stalling the next frame (a hitch mid-flight when Cariology opens).
      const fresh = this.batches.slice(before);
      for (const b of fresh) b.linking = true;
      Promise.all(fresh.map((b) => this.renderer.compileAsync(b.mesh, this.camera, this.scene).catch(() => {})))
        .then(() => { for (const b of fresh) { b.linking = false; b.mesh.visible = !!b.drawn; } this.needsRender = true; });
    }
    const drawn = new Set<Batch>();
    for (const m of this.meshes) {
      const { key, base, batch, instance, fadedBatch, fadedInstance } = m.userData as { key: string; base: THREE.Color; batch?: Batch; instance: number; fadedBatch?: Batch; fadedInstance?: number };
      const shown = this.shown(m);
      m.visible = shown;
      if (!batch) continue; // never shown yet
      const faded = isFaded(m);
      const override = this.colourOverride?.get(key);
      colour.copy(base);
      if (override) colour.set(override);
      // In the see-through batch when faded; drawn on its own (with its own material, for the glow)
      // when selected or hovered; otherwise in its batch.
      // (Not while its buffers are in the BVH worker: it stays in its batch until they are back.)
      const special = shown && !faded && (key === this.selected || key === this.hovered) && !m.userData.indexing;
      batch.mesh.setVisibleAt(instance, shown && !special && !faded);
      batch.mesh.setColorAt(instance, colour);
      if (shown && !special && !faded) drawn.add(batch);
      if (fadedBatch) {
        if (shown && faded) drawn.add(fadedBatch);
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
      // Vertex-coloured parts keep their own hues (a tint would turn brown caries purple): glow only.
      if (key === this.selected) c.lerp(SELECT, m.userData.vertexColours ? SELECT_MIX * 0.25 : SELECT_MIX);
      // Cut faces coloured from the zone palette get the tint in the shader (stronger: they are flat and unlit by the glow).
      (m.material.userData.cutTint as { value: THREE.Vector4 }).value.set(SELECT.r, SELECT.g, SELECT.b, key === this.selected ? SELECT_CUT_MIX : 0);
      m.material.emissive.copy(key === this.selected ? SELECT_GLOW : key === this.hovered ? HOVER_GLOW : NO_GLOW);
      // A blue glow on brown caries reads purple: painted parts get only a trace of it.
      if (m.userData.vertexColours) m.material.emissive.multiplyScalar(0.2);
    }
    // A batch with nothing to draw is left out of the frame, so its buffers reach the GPU only once used.
    for (const b of this.batches) { b.drawn = drawn.has(b); b.mesh.visible = (b.drawn && !b.linking) || !!b.uploading; }
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
    const next = new THREE.Vector3(), target = new THREE.Vector3();
    for (const [m, s] of this.state) {
      next.copy(s.base).add(s.bite).addScaledVector(s.radial, ease(spread));
      if (g > 0 && s.grid) next.lerp(target.copy(s.base).add(s.grid), g);
      // Only parts that moved are written: each write touches the batch's matrix texture, and place() runs
      // many times while a page opens (2,234 writes per call took seconds on a phone).
      if (next.equals(s.at)) continue;
      s.at.copy(next);
      m.position.copy(next);
      m.updateMatrixWorld();
      const { batch, instance, fadedBatch, fadedInstance } = m.userData as { batch?: Batch; instance: number; fadedBatch?: Batch; fadedInstance?: number };
      batch?.mesh.setMatrixAt(instance, m.matrixWorld);
      fadedBatch?.mesh.setMatrixAt(fadedInstance!, m.matrixWorld);
    }
    this.needsRender = true;
  }

  private frameKeys(keys: string[], padding: number, direction?: THREE.Vector3, duration = 1, opts: { context?: number; closerOnly?: boolean } = {}) {
    const box = new THREE.Box3();
    const set = new Set(keys);
    const parts = this.meshes.filter((m) => set.has(m.userData.key));
    // Meshes sharing a key (a tissue split into a fixed part and a per-stage patch): only the shown ones.
    const shown = parts.filter((m) => m.visible);
    for (const m of shown.length ? shown : parts) box.expandByObject(m);
    this.frameBox(box, padding, direction, duration, opts);
  }

  private frameBox(box: THREE.Box3, padding: number, direction?: THREE.Vector3, duration = 1, { context = 0.7, closerOnly = false } = {}) {
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
    this.frameNear = Math.max(distance / 100, 0.05);
    this.camera.near = this.frameNear;
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();

    const d = this.reduced ? 0 : duration;
    // The newest framing wins: two flights at once each set the camera every frame, and it stalled.
    gsap.killTweensOf(this.controls.target);
    gsap.killTweensOf(this.camera.position);
    this.flying = false;
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

  private pick(e: PointerEvent | WheelEvent): string | null {
    return this.hit(e)?.key ?? null;
  }

  /** The nearest drawn part under the pointer, how far it is from the camera, and where it was hit. */
  private hit(e: PointerEvent | WheelEvent): { key: string; distance: number; point: THREE.Vector3 } | null {
    const rect = this.canvas.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    // Broad phase: test the ray against each drawn part's box, then only the geometry of the parts the
    // ray enters, nearest first, stopping once no later box can be closer. (Testing every batch's
    // triangles took 50 ms per mouse move in Cariology.) Faded context parts can't be picked.
    const box = new THREE.Box3(), at = new THREE.Vector3();
    const near: [PartMesh, number][] = [];
    for (const m of this.meshes) {
      if (!m.visible || this.isFaded(m) || m.userData.indexing) continue;
      const g = m.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      box.copy(g.boundingBox!).applyMatrix4(m.matrixWorld);
      if (this.raycaster.ray.intersectBox(box, at)) near.push([m, at.distanceTo(this.raycaster.ray.origin)]);
    }
    near.sort((a, b) => a[1] - b[1]);
    let best: PartMesh | null = null, bestDistance = Infinity;
    const point = new THREE.Vector3();
    const hits: THREE.Intersection[] = [];
    for (const [m, entry] of near) {
      if (entry > bestDistance) break;
      hits.length = 0;
      m.raycast(this.raycaster, hits);
      if (hits.length && hits[0].distance < bestDistance) { bestDistance = hits[0].distance; best = m; point.copy(hits[0].point); }
    }
    return best ? { key: best.userData.key as string, distance: bestDistance, point } : null;
  }

  /**
   * Zooming in stops short of the surface under the pointer. Zoom-to-cursor otherwise carries the
   * camera onto and through a cut face, where the near plane slices it open and the walls between the
   * zones behind it show as holes.
   */
  private guardWheel = (e: WheelEvent) => {
    if (e.deltaY >= 0) return;
    const h = this.hit(e);
    const d = this.camera.position.distanceTo(this.controls.target);
    if (h && h.distance < Math.max(this.camera.near * 6, d * 0.12)) { e.preventDefault(); e.stopImmediatePropagation(); }
  };

  private handleDown = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY }; };

  /** Tap = press and release within 6px; anything further is an orbit drag. */
  private handleUp = (e: PointerEvent) => {
    if (!this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (moved > 6) return;
    const h = this.hit(e);
    if (h) this.focusSpot(h.point, h.key);
    this.onPick(h?.key ?? null);
  };

  private moveEvent: PointerEvent | null = null;

  /** Hover picks run at most once per frame, however many mouse events arrive. */
  private handleMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || this.down) return;
    if (!this.moveEvent) requestAnimationFrame(() => { const ev = this.moveEvent; this.moveEvent = null; if (ev && !this.down) this.hover(ev); });
    this.moveEvent = e;
  };

  private hover(e: PointerEvent) {
    const key = this.pick(e);
    const rect = this.canvas.getBoundingClientRect();
    this.onHover(key, key ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
    if (key === this.hovered) return;
    this.hovered = key;
    this.canvas.style.cursor = key ? 'pointer' : 'grab';
    this.apply();
  }

  private handleLeave = () => {
    this.hovered = null;
    this.onHover(null, null);
    this.apply();
  };

  /** The mesh a pin sits on: when several meshes share its part's key, the one shown now. */
  private pinMesh(p: { mesh: PartMesh }) {
    if (p.mesh.visible) return p.mesh;
    return this.meshes.find((m) => m.visible && m.userData.key === p.mesh.userData.key) ?? p.mesh;
  }

  /** Move each pin over its point; hide pins on hidden parts or on the far side of the part. */
  private placePins() {
    if (!this.pins.length) return;
    const { width, height } = this; // set in resize(): reading the canvas rect every frame forced a layout
    const world = new THREE.Vector3(), toCamera = new THREE.Vector3(), normal = new THREE.Vector3();
    for (const p of this.pins) {
      const mesh = this.pinMesh(p);
      mesh.localToWorld(world.copy(p.local));
      normal.copy(p.normal).transformDirection(mesh.matrixWorld);
      toCamera.copy(this.camera.position).sub(world).normalize();
      const facing = mesh.visible && normal.dot(toCamera) > 0.05;
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
      // Only the flow shader changes with the clock; timelines driven from outside (Cariology) need no redraw.
      if (this.batches.some((b) => b.flowOn) || this.meshes.some((m) => m.parent && m.userData.flowOn)) this.needsRender = true;
      if (now - this.lastTimeReport > 100) { this.lastTimeReport = now; this.onTime(this.flowTime.value); }
    }
    if (this.compiling) return;
    // The near plane follows the camera in: fixed at the framing distance's 1/100, it sliced open any
    // surface the camera came within 0.7 mm of in Cariology (the model is a tenth of real size).
    const near = Math.min(this.frameNear, Math.max(this.camera.position.distanceTo(this.controls.target) / 100, 1e-4));
    if (Math.abs(near - this.camera.near) > near * 0.01) { this.camera.near = near; this.camera.updateProjectionMatrix(); this.needsRender = true; }
    if (moving || this.needsRender || this.controls.autoRotate || gsap.globalTimeline.getChildren().length) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
      for (const b of this.batches) if (b.uploading) { b.uploading = false; b.mesh.visible = !!b.drawn && !b.linking; }
      this.placePins();
    }
  };
}

/**
 * Draw back faces as a flat fill in the part's own colour. Every part is a closed solid, so a back face
 * shows only where the camera has gone inside one (zoomed into the tooth) or looks through a gap
 * between two: the cut then reads as solid tissue instead of a hollow shell with the background
 * showing through its seams.
 */
function addCaps(material: THREE.MeshStandardMaterial) {
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      if (!gl_FrontFacing) gl_FragColor.rgb = diffuseColor.rgb * 0.78;`);
  };
}

/**
 * Patch a standard material so the `_flow` vertex attribute (signed distance along the part's
 * network, baked by scripts/lib/flow.mjs) drives travelling bright pulses. Returns the on/off uniform.
 */
function addFlow(material: THREE.MeshStandardMaterial, time: { value: number }) {
  const on = { value: 0 };
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
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
