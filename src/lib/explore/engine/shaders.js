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

// A thin line that stays smooth, and keeps its brightness, when it gets narrower than a pixel.
float lineAA(float distance, float halfWidth, float pixel) {
  return (1.0 - smoothstep(halfWidth, halfWidth + pixel, distance)) * (2.0 * halfWidth) / (2.0 * halfWidth + pixel);
}

// 1 inside the box [lo, hi] (per axis), with soft edges as wide as 'pixel'.
float boxMask(vec2 p, vec2 lo, vec2 hi, vec2 pixel) {
  vec2 inside = smoothstep(lo - pixel, lo + pixel, p) * (1.0 - smoothstep(hi - pixel, hi + pixel, p));
  return inside.x * inside.y;
}
`;

/**
 * Night lighting for surfaces that have no light of their own: a cool moon
 * from one side, the dark sky from above, light bounced up from the lit
 * streets, and the warm glow of lamps and shop windows near the ground.
 * `view` points from the surface to the camera.
 */
export const LIGHTING = /* glsl */ `
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uSkyLight;
uniform vec3 uBounce;
uniform vec3 uStreetLight;

vec3 shade(vec3 albedo, vec3 n, vec3 world, vec3 view, float occlusion) {
  vec3 ambient = mix(uBounce, uSkyLight, n.y * 0.5 + 0.5);
  float moon = max(dot(n, uMoonDir), 0.0);
  float nearStreet = exp(-max(world.y, 0.0) * 0.12);
  vec3 street = uStreetLight * nearStreet * (0.5 + 0.5 * (1.0 - abs(n.y)) + 0.6 * max(-n.y, 0.0));
  float rim = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 4.0);
  return (albedo * (ambient + uMoonColor * moon + street) + uSkyLight * rim * 0.6) * occlusion;
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
    uStreetLight: { value: palette.streetLight },
  };
}
