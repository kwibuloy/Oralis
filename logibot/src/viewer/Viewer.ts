import { gsap } from 'gsap';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ACCENT = new THREE.Color('#c9a45a');
const HOVER_MIX = 0.35;

export interface Pickable {
  key: string;
  group: string;
  color: string;
}

type PartMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

/**
 * Framework-free three.js viewer shared by every mode. React owns state and
 * calls this imperative API; this class never imports React or content.
 *
 * Each mesh is registered with a structure `key` and a `group`. Visibility,
 * context (faded) groups, selection, hover, isolation and per-group offsets
 * are all expressed in those terms.
 */
export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
  private controls: OrbitControls;
  private root = new THREE.Group();
  private meshes: PartMesh[] = [];
  private raycaster = new THREE.Raycaster();
  private down: { x: number; y: number } | null = null;
  private frame = 0;
  private needsRender = true;
  private resizeObserver: ResizeObserver;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  private visible = new Set<string>();
  private context = new Set<string>();
  private selected: string | null = null;
  private hovered: string | null = null;
  private isolated = false;

  onPick: (key: string | null) => void = () => {};
  onHover: (key: string | null, at: { x: number; y: number } | null) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene.add(this.root);
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x2a2018, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 6, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xc9a45a, 1.2);
    rim.position.set(-6, 2, -6);
    this.scene.add(rim);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.screenSpacePanning = true;
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
    const add: [THREE.Mesh, Pickable][] = [];
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const info = describe(mesh.name) ?? describe(mesh.parent?.name ?? '');
      if (info) add.push([mesh, info]);
    });
    for (const [mesh, info] of add) this.register(mesh, info);
    this.afterLoad();
  }

  /** Add a procedurally built group whose meshes carry `userData.key`. */
  loadGroup(group: THREE.Group, describe: (key: string) => Pickable) {
    const add: THREE.Mesh[] = [];
    group.traverse((o) => (o as THREE.Mesh).isMesh && add.push(o as THREE.Mesh));
    for (const mesh of add) this.register(mesh, describe(mesh.userData.key));
    this.afterLoad();
  }

  setVisibleGroups(groups: Iterable<string>, context: Iterable<string> = []) {
    this.visible = new Set(groups);
    this.context = new Set(context);
    this.apply();
  }

  /** Further restrict visibility with a predicate on structure key (e.g. one arch). */
  private filter: (key: string) => boolean = () => true;
  setFilter(fn: (key: string) => boolean) {
    this.filter = fn;
    this.apply();
  }

  select(key: string | null, { frame = true } = {}) {
    this.selected = key;
    this.apply();
    if (key && frame) this.frameKeys([key], 1.9);
  }

  setIsolated(on: boolean) {
    this.isolated = on;
    this.apply();
    if (on && this.selected) this.frameKeys([this.selected], 1.6);
  }

  /** Move every mesh whose key passes `match` by `offset` (e.g. open the bite). */
  setOffset(match: (key: string) => boolean, offset: THREE.Vector3Like) {
    for (const m of this.meshes) {
      if (!match(m.userData.key)) continue;
      const base = m.userData.basePosition as THREE.Vector3;
      const to = { x: base.x + offset.x, y: base.y + offset.y, z: base.z + offset.z };
      if (this.reduced) m.position.copy(to);
      else gsap.to(m.position, { ...to, duration: 0.8, ease: 'power3.inOut', onUpdate: () => void (this.needsRender = true) });
    }
    this.needsRender = true;
  }

  /** Fit the camera to the currently visible meshes from a given direction. */
  frameAll(direction = new THREE.Vector3(0.35, 0.15, 1)) {
    const shown = this.meshes.filter((m) => m.visible);
    const keys = (shown.length ? shown : this.meshes).map((m) => m.userData.key as string);
    this.frameKeys(keys, 0.95, direction, 0);
  }

  resetView() {
    this.frameAll();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handleDown);
    this.canvas.removeEventListener('pointerup', this.handleUp);
    this.canvas.removeEventListener('pointermove', this.handleMove);
    this.canvas.removeEventListener('pointerleave', this.handleLeave);
    for (const m of this.meshes) { gsap.killTweensOf(m.position); m.geometry.dispose(); m.material.dispose(); }
    this.controls.dispose();
    this.renderer.dispose();
  }

  // ---------- internals ----------

  private register(mesh: THREE.Mesh, info: Pickable) {
    const material = new THREE.MeshStandardMaterial({
      color: info.color, roughness: info.group === 'teeth' ? 0.32 : 0.62, metalness: 0,
      side: (mesh.material as THREE.Material).side, transparent: true,
    });
    (mesh.material as THREE.Material).dispose();
    const m = mesh as unknown as PartMesh;
    m.material = material;
    m.userData = { ...m.userData, key: info.key, group: info.group, base: new THREE.Color(info.color) };
    // Re-parent with world transform so offsets and framing work in one space.
    m.updateWorldMatrix(true, false);
    m.matrixWorld.decompose(m.position, m.quaternion, m.scale);
    m.userData.basePosition = m.position.clone();
    this.root.add(m);
    this.meshes.push(m);
  }

  private afterLoad() {
    this.apply();
    this.frameAll();
  }

  private apply() {
    const anySelectedVisible = this.selected !== null;
    for (const m of this.meshes) {
      const { key, group, base } = m.userData as { key: string; group: string; base: THREE.Color };
      const passes = this.filter(key);
      const shown = (this.visible.has(group) || this.context.has(group) || key === this.selected) && passes;
      const isolatedOut = this.isolated && anySelectedVisible && key !== this.selected;
      m.visible = shown;

      let opacity = 1;
      if (this.context.has(group) && !this.visible.has(group)) opacity = 0.16;
      if (isolatedOut) opacity = Math.min(opacity, 0.07);
      if (key === this.selected) opacity = 1;
      m.material.opacity = opacity;
      m.material.depthWrite = opacity > 0.5;
      m.renderOrder = opacity < 1 ? 1 : 0;

      const c = m.material.color.copy(base);
      if (key === this.selected) c.copy(ACCENT);
      else if (key === this.hovered) c.lerp(ACCENT, HOVER_MIX);
    }
    this.needsRender = true;
  }

  private frameKeys(keys: string[], padding: number, direction?: THREE.Vector3, duration = 1) {
    const box = new THREE.Box3();
    const set = new Set(keys);
    for (const m of this.meshes) if (set.has(m.userData.key)) box.expandByObject(m);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    // Never frame tighter than a share of the whole model, so small parts keep their surroundings.
    const all = new THREE.Box3();
    for (const m of this.meshes) if (m.visible) all.expandByObject(m);
    if (!all.isEmpty()) sphere.radius = Math.max(sphere.radius, all.getBoundingSphere(new THREE.Sphere()).radius * 0.45);
    const current = this.camera.position.clone().sub(this.controls.target);
    const dir = (direction ?? (current.lengthSq() > 1e-6 ? current : new THREE.Vector3(0.35, 0.15, 1))).clone().normalize();
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const fit = Math.max(sphere.radius / Math.sin(fov / 2), sphere.radius / Math.sin(Math.atan(Math.tan(fov / 2) * this.camera.aspect)));
    const distance = fit * padding;
    const to = sphere.center.clone().add(dir.multiplyScalar(distance));
    this.controls.minDistance = sphere.radius * 0.6;
    this.controls.maxDistance = Math.max(distance * 4, 60);

    const d = this.reduced ? 0 : duration;
    gsap.to(this.controls.target, { x: sphere.center.x, y: sphere.center.y, z: sphere.center.z, duration: d, ease: 'power3.inOut' });
    gsap.to(this.camera.position, { x: to.x, y: to.y, z: to.z, duration: d, ease: 'power3.inOut', onUpdate: () => void (this.needsRender = true) });
    if (!d) { this.controls.target.copy(sphere.center); this.camera.position.copy(to); }
    this.camera.near = Math.max(distance / 100, 0.05);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
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
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  /** Render on demand: only when something changed or controls are damping. */
  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const moving = this.controls.update();
    if (moving || this.needsRender || gsap.globalTimeline.getChildren().length) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
    }
  };
}
