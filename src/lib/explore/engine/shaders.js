// Small pieces of shader code shared by the city's materials.

/**
 * Distance haze. Near the ground the haze takes the glow of the city; higher up
 * it fades into the dark sky, so far towers stand as silhouettes.
 */
export const FOG = /* glsl */ `
uniform vec3 uFogColor;
uniform vec3 uFogLow;
uniform float uFogDensity;

float fogAmount(float depth) {
  return 1.0 - exp(-uFogDensity * uFogDensity * depth * depth);
}

vec3 applyFog(vec3 color, float depth, float height) {
  vec3 haze = mix(uFogLow, uFogColor, smoothstep(0.0, 80.0, height));
  return mix(color, haze, fogAmount(depth));
}
`;

export const NOISE = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n * 31.7 + 5.3));
}

float noise21(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), f.x),
    mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

// Three octaves of noise, about 0 to 1.
float fbm(vec2 p) {
  return noise21(p) * 0.55 + noise21(p * 2.07 + 13.1) * 0.3 + noise21(p * 4.3 + 71.0) * 0.15;
}

// A thin line that stays smooth, and keeps its brightness, when it gets narrower than a pixel.
float lineAA(float distance, float halfWidth, float pixel) {
  return (1.0 - smoothstep(halfWidth, halfWidth + pixel, distance)) * (2.0 * halfWidth) / (2.0 * halfWidth + pixel);
}

// 1 inside the box [lo, hi] (per axis), with soft edges as wide as 'pixel'.
float boxMask(vec2 p, vec2 lo, vec2 hi, vec2 pixel) {
  vec2 inside = smoothstep(lo - pixel, lo + pixel, p) * (1.0 - smoothstep(hi - pixel, hi + pixel, p));
  return inside.x * inside.y;
}

float pulseArea(float x, float duty) {
  return floor(x) * duty + min(fract(x), duty);
}

// Stripes: 1 over the first 'duty' share of every period of 'x', averaged over
// 'pixel' (how much x changes across a pixel), so that slats, bars and courses
// melt into an even tone in the distance instead of shimmering.
float stripes(float x, float duty, float pixel) {
  float w = max(pixel, 1e-4);
  return (pulseArea(x + 0.5 * w, duty) - pulseArea(x - 0.5 * w, duty)) / w;
}

// How well a detail 'size' metres across shows at 'pixel' metres a pixel: 1 up close, 0 once it is smaller than a pixel.
float resolved(float pixel, float size) {
  return clamp(size / max(pixel, 1e-5) - 0.6, 0.0, 1.0);
}
`;

/**
 * Night lighting. Nothing in the city casts real light; instead every surface
 * reads the same few sources:
 * - the moon, from one side, and the dark sky above with light bounced up from
 *   the streets below;
 * - the "light field": a map of the city seen from above that holds the colour
 *   of the neon, lamps and shop windows near each spot on the ground, and how
 *   built-up the spot is (see lightfield.js). It lights walls, pavement, cars
 *   and passers-by in the colour of whatever glows beside them;
 * - a small picture of the sky and the far city all around, for reflections.
 * `view` points from the surface to the camera.
 *
 * LIGHT_FIELD is the part that reads those sources; it also works in a vertex
 * shader. LIGHTING adds the shading of a surface, for fragment shaders.
 */
export const LIGHT_FIELD = /* glsl */ `
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uSkyLight;
uniform vec3 uBounce;
uniform sampler2D uLightMap;
uniform vec4 uLightArea;     // the map on the ground: min x, min z, 1 / width, 1 / depth
uniform samplerCube uEnv;
uniform float uEnvLevels;

// rgb: the light near the ground at (x, z); a: how built-up the spot is. 'blur' picks a softer copy.
vec4 lightField(vec2 xz, float blur) {
  return textureLod(uLightMap, (xz - uLightArea.xy) * uLightArea.zw, blur);
}

// The sky and the far city in direction 'dir', blurred for rough surfaces.
vec3 skyAround(vec3 dir, float roughness) {
  return textureLod(uEnv, dir, roughness * uEnvLevels).rgb;
}

float luma(vec3 c) {
  return dot(c, vec3(0.3, 0.55, 0.15));
}

// How strongly the street's light reaches a point 'height' metres up.
float streetReach(float height) {
  return exp(-max(height - 2.5, 0.0) * 0.15);
}
`;

export const LIGHTING = /* glsl */ `
${LIGHT_FIELD}

// The normal 'n' tilted by a height field 'h' (metres), found from how h changes across the screen.
vec3 bumped(vec3 n, vec3 world, float h, float strength) {
  vec3 dpdx = dFdx(world);
  vec3 dpdy = dFdy(world);
  float dhdx = dFdx(h);
  float dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, n);
  vec3 r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * n - strength * grad);
}

/**
 * The colour of a surface. 'albedo' is its own colour, 'roughness' 0 (mirror) to
 * 1 (matt), 'metal' 0 or 1, 'occlusion' how open it is to light (1 fully).
 */
vec3 shade(vec3 albedo, vec3 n, vec3 world, vec3 view, float roughness, float metal, float occlusion) {
  vec4 field = lightField(world.xz, 0.0);
  float reach = streetReach(world.y);
  float facing = 1.0;
#ifndef LOW
  // The street's light comes from where the map is brighter.
  vec4 soft = lightField(world.xz, 2.0);
  float east = luma(lightField(world.xz + vec2(2.5, 0.0), 1.5).rgb) - luma(lightField(world.xz - vec2(2.5, 0.0), 1.5).rgb);
  float south = luma(lightField(world.xz + vec2(0.0, 2.5), 1.5).rgb) - luma(lightField(world.xz - vec2(0.0, 2.5), 1.5).rgb);
  vec2 toward = vec2(east, south);
  float slope = length(toward);
  vec3 from = normalize(vec3(toward / max(slope, 1e-5), 0.45));
  float sided = clamp(slope / (luma(soft.rgb) + 0.02) * 1.6, 0.0, 1.0);
  facing = mix(1.0, clamp(0.5 + 0.9 * dot(n, from), 0.12, 1.5), sided * (1.0 - 0.7 * max(n.y, 0.0)));
#endif
  // Walls take the street's light full on, the ground a little less, undersides (canopies, awnings) the most.
  float aspect = 0.75 + 0.25 * (1.0 - abs(n.y)) + 0.45 * max(-n.y, 0.0);
  vec3 street = field.rgb * reach * facing * aspect;

  vec3 ambient = mix(uBounce, uSkyLight, n.y * 0.5 + 0.5) * (1.0 - 0.35 * field.a * reach);
  float moon = max(dot(n, uMoonDir), 0.0);
  vec3 diffuse = albedo * (1.0 - metal) * (ambient * occlusion + uMoonColor * moon * occlusion + street * mix(0.6, 1.0, occlusion));

  // Reflections: the sky and far city, the moon's glint, and the street's own lights.
  vec3 f0 = mix(vec3(0.04), albedo, metal);
  float cosine = clamp(dot(n, view), 0.0, 1.0);
  vec3 fresnel = f0 + (max(vec3(1.0 - roughness), f0) - f0) * pow(1.0 - cosine, 5.0);
  vec3 r = reflect(-view, n);
  // Down in the streets the buildings hide most of the sky; what shows in a
  // surface that faces sideways is the glow of the street instead.
  float open = mix(1.0, 0.25 + 0.75 * smoothstep(-0.05, 0.6, r.y), field.a * reach);
  vec3 mirrored = skyAround(r, roughness) * open;
  float gloss = 1.0 - roughness;
  vec3 h = normalize(view + uMoonDir);
  float power = 2.0 / max(roughness * roughness * roughness * roughness, 0.0004) - 2.0;
  float glint = pow(max(dot(n, h), 0.0), power) * (power + 2.0) * 0.04 * moon;
#ifndef LOW
  float away = 3.0 + 9.0 * roughness;
  vec3 glow = lightField(world.xz + r.xz * away, 1.0 + roughness * 3.0).rgb * reach * (0.6 + 1.6 * gloss);
#else
  vec3 glow = field.rgb * reach * (0.5 + gloss);
#endif
  vec3 specular = fresnel * (mirrored + uMoonColor * glint + glow) * occlusion;
  return diffuse + specular;
}
`;

// Ends every fragment shader: applies the renderer's tone mapping and colour
// space when drawing straight to the screen (the lite quality), and does nothing
// when drawing into the post-processing buffer, which applies them at the end.
export const OUTPUT = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

/** Uniforms every material shares: one clock, one haze and one set of lights for the whole city. */
export function createSharedUniforms(palette, fogDensity) {
  return {
    uTime: { value: 0 },
    uFogColor: { value: palette.fog },
    uFogLow: { value: palette.fogLow },
    uFogDensity: { value: fogDensity },
    // Turns a size in metres into pixels for point sprites: the drawing height
    // over 2·tan(fov / 2). The engine sets it whenever the view is resized.
    uPointScale: { value: 600 },
    uMoonDir: { value: palette.moonDir },
    uMoonColor: { value: palette.moonLight },
    uSkyLight: { value: palette.skyLight },
    uBounce: { value: palette.bounceLight },
    // Set by the engine once the light field and the picture of the sky are made.
    uLightMap: { value: null },
    uLightArea: { value: [0, 0, 1, 1] },
    uEnv: { value: null },
    uEnvLevels: { value: 5 },
    // The neon colours of shop fronts, in the order of palette.neon.
    uNeon: { value: palette.neon },
    // The names over the shops, as one texture (see drawShopNames in signs.js); set by the engine.
    uShopNames: { value: null },
  };
}
