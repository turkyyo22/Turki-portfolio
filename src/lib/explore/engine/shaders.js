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
`;

// Ends every fragment shader: applies the renderer's tone mapping and colour
// space when drawing straight to the screen (the lite quality), and does nothing
// when drawing into the post-processing buffer, which applies them at the end.
export const OUTPUT = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

/** Uniforms every material shares: one clock and one haze for the whole city. */
export function createSharedUniforms(palette, fogDensity) {
  return {
    uTime: { value: 0 },
    uFogColor: { value: palette.fog },
    uFogLow: { value: palette.fogLow },
    uFogDensity: { value: fogDensity },
    // Turns a size in metres into pixels for point sprites: the drawing height
    // over 2·tan(fov / 2). The engine sets it whenever the view is resized.
    uPointScale: { value: 600 },
  };
}
