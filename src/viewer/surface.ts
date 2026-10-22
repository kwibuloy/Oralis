import * as THREE from 'three';

/**
 * Procedural surface texture for a part, computed per pixel in the part's own (local) coordinates so
 * it stays sharp at any zoom and needs no image files. Patterns that follow the tissue read optional
 * vertex attributes baked into the model: _dir (a direction such as enamel rods or dentinal tubules),
 * _depth (a distance for incremental lines) and _cut (1 on a cut face, 0 on the natural surface).
 * Sizes are in the part's local units. Every field is optional; amounts are roughly 0..1.
 */
export interface SurfaceStyle {
  /** Fine mottling of colour and relief. */
  grain?: number;
  grainSize?: number;
  /** Streaks along _dir, on cut faces only (enamel rods, dentinal tubules). */
  streaks?: number;
  streakSize?: number;
  /** Thin lines across _depth, on cut faces only (striae of Retzius, incremental lines). */
  bands?: number;
  bandSpacing?: number;
  /** Fine horizontal ridges on the natural surface only (perikymata). */
  perikymata?: number;
  perikymataSpacing?: number;
  /** How much the pattern raises and lowers the surface (lighting relief). */
  bump?: number;
  /** Patchy staining towards another colour. */
  stain?: string;
  stainAmount?: number;
  stainSize?: number;
  roughness?: number;
  /** A glossy layer on top (enamel). */
  clearcoat?: number;
  /** Cut faces drawn flat in the part's colour: no streaks, bands, grain, stain or relief there. */
  flatCut?: boolean;
  /**
   * Cut faces take the colour of the zone palette at the vertex attribute _zone (the part's own zone),
   * so one palette switches every cut face between study and natural colours.
   */
  cutZone?: boolean;
}

/** Colours of the zones a `cutZone` part's cut faces take, by index (linear, as material colours are). */
export const ZONE_SLOTS = 16;

const GLSL = /* glsl */ `
float srfHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float srfNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(srfHash(i), srfHash(i + vec3(1, 0, 0)), f.x), mix(srfHash(i + vec3(0, 1, 0)), srfHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(srfHash(i + vec3(0, 0, 1)), srfHash(i + vec3(1, 0, 1)), f.x), mix(srfHash(i + vec3(0, 1, 1)), srfHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// 1 when a pattern of this size spans several pixels, fading to 0 as it shrinks below a pixel (no shimmer).
float srfFade(float size, float px) { return smoothstep(1.5, 4.0, size / max(px, 1e-6)); }
float srfFbm(vec3 p) { return (0.5 * srfNoise(p) + 0.25 * srfNoise(p * 2.03 + 7.1) + 0.125 * srfNoise(p * 4.01 + 3.7)) / 0.875; }
// Bump mapping from a height's screen-space derivatives (as three.js does for bump maps).
vec3 srfPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 g = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - g);
}
`;

const f = (v: number) => v.toFixed(5);

/**
 * Add the surface texture to a material (its colour and lighting stay controlled as usual). `cutTint`
 * (rgb and amount) tints `cutZone` cut faces, whose colour comes from the palette, not the material:
 * the selection highlight sets it.
 */
export function addSurface(material: THREE.MeshStandardMaterial, s: SurfaceStyle, zones?: { value: THREE.Color[] }, cutTint?: { value: THREE.Vector4 }) {
  const stain = new THREE.Color(s.stain ?? '#000');
  const cutZone = !!(s.cutZone && zones);
  material.onBeforeCompile = (shader) => {
    if (cutZone) {
      shader.uniforms.uZone = zones!;
      shader.uniforms.uCutTint = cutTint ?? { value: new THREE.Vector4(0, 0, 0, 0) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float _zone;\nvarying float vZoneOwn;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZoneOwn = _zone;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform vec3 uZone[${ZONE_SLOTS}];\nuniform vec4 uCutTint;\nvarying float vZoneOwn;`);
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 _dir;\nattribute float _depth;\nattribute float _cut;\nvarying vec3 vSrfLocal;\nvarying vec3 vSrfDir;\nvarying float vSrfDepth;\nvarying float vSrfCut;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSrfLocal = position;\nvSrfDir = _dir;\nvSrfDepth = _depth;\nvSrfCut = _cut;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSrfLocal;\nvarying vec3 vSrfDir;\nvarying float vSrfDepth;\nvarying float vSrfCut;\n${GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float srfCut = clamp(vSrfCut, 0.0, 1.0);
        float srfPx = length(fwidth(vSrfLocal)); // how much of the part one pixel covers
        float srfGrain = srfFbm(vSrfLocal / ${f(s.grainSize ?? 0.4)});
        // Heights are in the part's units, scaled by each pattern's size, so relief slopes stay gentle.
        float srfGrainK = ${f(s.grain ?? 0)} * srfFade(${f(s.grainSize ?? 0.4)}, srfPx) * (srfGrain - 0.5);
        float srfH = srfGrainK * ${f((s.grainSize ?? 0.4) * 0.15)};
        float srfShade = srfGrainK;
        ${s.streaks ? `{
          // Streaks: noise that does not change along the direction, so it draws lines along it.
          vec3 d = length(vSrfDir) > 0.5 ? normalize(vSrfDir) : vec3(0.0, 1.0, 0.0);
          vec3 q = vSrfLocal - d * dot(vSrfLocal, d);
          float st = srfNoise(q / ${f(s.streakSize ?? 0.05)}) * 0.7 + srfNoise(q / ${f((s.streakSize ?? 0.05) * 0.45)}) * 0.3;
          float k = ${f(s.streaks)} * srfCut * (length(vSrfDir) > 0.5 ? 1.0 : 0.0) * srfFade(${f(s.streakSize ?? 0.05)}, srfPx);
          srfH += k * (st - 0.5) * ${f((s.streakSize ?? 0.05) * 0.1)};
          srfShade += k * (st - 0.5);
        }` : ''}
        ${s.bands ? `{
          float b = pow(0.5 + 0.5 * cos(6.2831853 * vSrfDepth / ${f(s.bandSpacing ?? 0.3)} + srfGrain * 2.0), 10.0);
          srfShade -= ${f(s.bands)} * srfCut * b * srfFade(${f((s.bandSpacing ?? 0.3) * 0.3)}, srfPx);
        }` : ''}
        ${s.perikymata ? `{
          float pk = 0.5 + 0.5 * sin(6.2831853 * vSrfLocal.y / ${f(s.perikymataSpacing ?? 0.12)} + srfGrain * 1.5);
          srfH += ${f(s.perikymata)} * (1.0 - srfCut) * (pk - 0.5) * srfFade(${f(s.perikymataSpacing ?? 0.12)}, srfPx) * ${f((s.perikymataSpacing ?? 0.12) * 0.15)};
        }` : ''}
        ${s.flatCut ? 'srfShade *= 1.0 - srfCut; srfH *= 1.0 - srfCut;' : ''}
        diffuseColor.rgb *= 1.0 + srfShade * 0.55;
        ${s.stain ? `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${f(stain.r)}, ${f(stain.g)}, ${f(stain.b)}), ${f(s.stainAmount ?? 0.5)} * ${s.flatCut ? '(1.0 - srfCut) * ' : ''}smoothstep(0.42, 0.72, srfFbm(vSrfLocal / ${f(s.stainSize ?? 0.8)} + 11.0)));` : ''}
        ${cutZone ? 'diffuseColor.rgb = mix(diffuseColor.rgb, mix(uZone[int(vZoneOwn + 0.5)], uCutTint.rgb, uCutTint.a), srfCut);' : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = srfPerturb(-vViewPosition, normal, vec2(dFdx(srfH), dFdy(srfH)) * ${f((s.bump ?? 0.5) * 6)}, faceDirection);`);
  };
  material.customProgramCacheKey = () => `surface:${JSON.stringify(s)}`;
}
