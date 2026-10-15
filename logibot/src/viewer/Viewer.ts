import { gsap } from 'gsap';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SELECT = new THREE.Color('#2563eb');
const SELECT_MIX = 0.22;
const SELECT_GLOW = new THREE.Color('#1d4ed8').multiplyScalar(0.32);
const HOVER_GLOW = new THREE.Color('#2563eb').multiplyScalar(0.12);
const NO_GLOW = new THREE.Color(0x000000);
/** Fraction of the canvas height the bottom cards cover; the projection is shifted up by half of it. */
const BOTTOM_INSET = 0.09;

export type View = 'front' | 'side' | 'back' | 'top' | 'bottom';
const VIEW_DIR: Record<View, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0.08, 1),
  side: new THREE.Vector3(1, 0.08, 0),
  back: new THREE.Vector3(0, 0.08, -1),
  top: new THREE.Vector3(0, 1, 0.001),
  bottom: new THREE.Vector3(0, -1, 0.001),
};

export interface Pickable {
  key: string;
  group: string;
  color: string;
}

type PartMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

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

  onPick: (key: string | null) => void = () => {};
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
    this.controls.autoRotateSpeed = 1.2;
    this.controls.addEventListener('change', () => (this.needsRender = true));

    canvas.addEventListener('pointerdown', this.handleDown);
    canvas.addEventListener('pointerup', this.handleUp);
    canvas.addEventListener('pointermove', this.handleMove);
    canvas.addEventListener('pointerleave', this.handleLeave);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.loop();
  }

  /** Load a Draco-compressed GLB; `describe` maps a node name to its structure, or null to drop it. */
  async loadGLB(url: string, describe: (nodeName: string) => Pickable | null): Promise<void> {
    const draco = new DRACOLoader().setDecoderPath('/draco/');
    const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(url);
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

    const all = new THREE.Box3();
    for (const m of this.meshes) all.expandByObject(m);
    all.getCenter(this.modelCenter);
    for (const [, s] of this.state) {
      const d = s.center.clone().sub(this.modelCenter);
      // Spread outward, with a floor so parts near the centre still move.
      s.radial = d.multiplyScalar(0.9).add(d.clone().normalize().multiplyScalar(all.getSize(new THREE.Vector3()).length() * 0.06));
    }
    this.apply();
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

  select(key: string | null, { frame = true } = {}) {
    this.selected = key;
    this.apply();
    if (key && frame) this.frameKeys([key], 2.2);
  }

  setIsolated(on: boolean) {
    this.isolated = on;
    this.gridDirty = true;
    this.apply();
    this.place();
    if (this.selected) this.frameKeys(on ? [this.selected] : this.visibleKeys(), on ? 1.5 : 1.12);
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
    this.frameKeys(this.visibleKeys(), 1.12, undefined, duration);
  }

  setView(view: View) {
    this.frameKeys(this.visibleKeys(), 1.12, VIEW_DIR[view].clone());
  }

  setAutoRotate(on: boolean) {
    this.controls.autoRotate = on;
  }

  /** Fit the camera to the visible parts. */
  frameAll(direction = new THREE.Vector3(0.35, 0.15, 1)) {
    this.frameKeys(this.visibleKeys(), 1.12, direction, 0);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handleDown);
    this.canvas.removeEventListener('pointerup', this.handleUp);
    this.canvas.removeEventListener('pointermove', this.handleMove);
    this.canvas.removeEventListener('pointerleave', this.handleLeave);
    for (const [m, s] of this.state) { gsap.killTweensOf(s.bite); m.geometry.dispose(); m.material.dispose(); }
    this.controls.dispose();
    this.renderer.dispose();
  }

  // ---------- internals ----------

  private register(mesh: THREE.Mesh, info: Pickable) {
    const material = new THREE.MeshStandardMaterial({
      color: info.color, roughness: info.group === 'teeth' || info.group === 'enamel' ? 0.3 : 0.6, metalness: 0,
      side: THREE.DoubleSide, transparent: true,
    });
    (mesh.material as THREE.Material).dispose();
    const m = mesh as unknown as PartMesh;
    m.material = material;
    // Bake the world transform so offsets and framing live in one space.
    m.matrixWorld.decompose(m.position, m.quaternion, m.scale);
    m.userData = { key: info.key, group: info.group, base: new THREE.Color(info.color) };
    this.root.add(m);
    this.meshes.push(m);
    const box = new THREE.Box3().setFromObject(m);
    this.state.set(m, {
      base: m.position.clone(), center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()),
      bite: new THREE.Vector3(), radial: new THREE.Vector3(), grid: null,
    });
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
    for (const m of this.meshes) {
      const { key, group, base } = m.userData as { key: string; group: string; base: THREE.Color };
      m.visible = this.shown(m);
      const faded = this.context.has(group) && !this.visible.has(group) && key !== this.selected;
      m.material.opacity = faded ? 0.18 : 1;
      m.material.depthWrite = !faded;
      m.renderOrder = faded ? 1 : 0;
      // Keep each tissue's own hue readable; selection adds a blue glow rather than recolouring.
      const c = m.material.color.copy(base);
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
    }
    this.needsRender = true;
  }

  private frameKeys(keys: string[], padding: number, direction?: THREE.Vector3, duration = 1) {
    const box = new THREE.Box3();
    const set = new Set(keys);
    for (const m of this.meshes) if (set.has(m.userData.key)) box.expandByObject(m);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    // Never frame tighter than a share of everything visible, so small parts keep their surroundings.
    if (!this.isolated) {
      const all = new THREE.Box3();
      for (const m of this.meshes) if (m.visible) all.expandByObject(m);
      if (!all.isEmpty()) sphere.radius = Math.max(sphere.radius, all.getBoundingSphere(new THREE.Sphere()).radius * 0.7);
    }
    const current = this.camera.position.clone().sub(this.controls.target);
    const dir = (direction ?? (current.lengthSq() > 1e-6 ? current : new THREE.Vector3(0.35, 0.15, 1))).clone().normalize();
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const fit = Math.max(sphere.radius / Math.sin(fov / 2), sphere.radius / Math.sin(Math.atan(Math.tan(fov / 2) * this.camera.aspect)));
    const distance = fit * padding;
    const to = sphere.center.clone().add(dir.multiplyScalar(distance));
    this.controls.minDistance = sphere.radius * 0.4;
    this.controls.maxDistance = Math.max(distance * 4, 60);
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
    gsap.to(this.camera.position, { x: to.x, y: to.y, z: to.z, duration: d, ease: 'power3.inOut', onUpdate: () => void (this.needsRender = true) });
  }

  private pick(e: PointerEvent): string | null {
    const rect = this.canvas.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    const targets = this.meshes.filter((m) => m.visible && m.material.opacity > 0.5);
    return (this.raycaster.intersectObjects(targets, false)[0]?.object.userData.key as string) ?? null;
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

  private resize() {
    const box = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect();
    if (!box.width || !box.height) return;
    this.renderer.setSize(box.width, box.height, false);
    this.camera.aspect = box.width / box.height;
    // Shift the projection so the model centres in the space above the bottom cards.
    const shift = box.width > 860 ? Math.round(box.height * BOTTOM_INSET) : Math.round(box.height * 0.06);
    this.camera.setViewOffset(box.width, box.height, 0, shift, box.width, box.height);
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  /** Render on demand: only while something changes, controls damp or the model auto-rotates. */
  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const moving = this.controls.update();
    if (moving || this.needsRender || this.controls.autoRotate || gsap.globalTimeline.getChildren().length) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
    }
  };
}
