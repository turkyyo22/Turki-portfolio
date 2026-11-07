"use client";

import { useEffect, useRef } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  TorusGeometry,
  WebGLRenderer,
} from "three";

// A softly deforming sphere with a fresnel glow: brighter at the edges, like an energy core.
const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vWave;

  void main() {
    vec3 p = position;
    float wave = sin(p.x * 3.2 + uTime * 1.3) * sin(p.y * 2.8 + uTime * 0.9) * sin(p.z * 3.4 + uTime * 1.1);
    // While "speaking", a fast, shallow ripple runs over the surface.
    float ripple = sin(p.y * 7.0 - uTime * 4.0) * uPulse;
    vec3 displaced = p + normal * (wave * 0.08 + ripple * 0.035);
    vWave = wave + ripple * 0.5;
    vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uPulse;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vWave;

  void main() {
    float fresnel = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.0);
    vec3 color = mix(uColorB, uColorA, clamp(vWave * 0.8 + 0.55, 0.0, 1.0));
    float glow = 0.35 + fresnel * 1.2 + uPulse * 0.25;
    gl_FragColor = vec4(color * glow, 0.35 + fresnel * 0.65);
  }
`;

function createDust(count) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const radius = 1.9 + Math.random() * 0.6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

/**
 * The T.A Core orb, rendered with three.js. `speaking` makes it pulse.
 * Calls `onUnsupported` when WebGL is unavailable so the caller can show a fallback.
 */
export default function CoreOrb({ size = 120, speaking = false, onUnsupported }) {
  const hostRef = useRef(null);
  const speakingRef = useRef(speaking);

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer;
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      onUnsupported?.();
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(size, size);
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(35, 1, 0.1, 50);
    camera.position.z = 6.4;
    const orb = new Group();
    scene.add(orb);

    const coreGeometry = new IcosahedronGeometry(1, 24);
    const coreMaterial = new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uColorA: { value: new Color("#00E5FF") },
        uColorB: { value: new Color("#3B82F6") },
      },
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const core = new Mesh(coreGeometry, coreMaterial);

    const shellGeometry = new IcosahedronGeometry(1.2, 2);
    const shellMaterial = new MeshBasicMaterial({ color: "#00E5FF", wireframe: true, transparent: true, opacity: 0.12 });
    const shell = new Mesh(shellGeometry, shellMaterial);

    const ringGeometry = new TorusGeometry(1.6, 0.012, 8, 160);
    const ringMaterial = new MeshBasicMaterial({ color: "#7DF9FF", transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false });
    const ringA = new Mesh(ringGeometry, ringMaterial);
    ringA.rotation.x = Math.PI * 0.42;
    const ringB = new Mesh(ringGeometry, ringMaterial);
    ringB.rotation.set(Math.PI * 0.58, Math.PI * 0.35, 0);
    ringB.scale.setScalar(1.12);

    const dustGeometry = createDust(140);
    const dustMaterial = new PointsMaterial({ color: "#9BEFFF", size: 0.035, transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false });
    const dust = new Points(dustGeometry, dustMaterial);

    orb.add(core, shell, ringA, ringB, dust);

    const startedAt = performance.now();
    let pulse = 0;
    let frame = 0;
    const renderFrame = (now) => {
      const time = (now - startedAt) / 1000;
      pulse += ((speakingRef.current ? 1 : 0) - pulse) * 0.08;
      coreMaterial.uniforms.uTime.value = time;
      coreMaterial.uniforms.uPulse.value = pulse;
      core.rotation.y = time * 0.35;
      shell.rotation.set(time * 0.1, -time * 0.2, 0);
      ringA.rotation.z = time * 0.6;
      ringB.rotation.z = -time * 0.45;
      dust.rotation.y = time * 0.08;
      orb.scale.setScalar(1 + Math.sin(time * 2.2) * 0.015 + pulse * 0.04);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(renderFrame);
    };
    frame = requestAnimationFrame(renderFrame);

    // Don't burn battery while the tab is in the background.
    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame) {
        frame = requestAnimationFrame(renderFrame);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      for (const geometry of [coreGeometry, shellGeometry, ringGeometry, dustGeometry]) geometry.dispose();
      for (const material of [coreMaterial, shellMaterial, ringMaterial, dustMaterial]) material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [size, onUnsupported]);

  return <div ref={hostRef} aria-hidden="true" style={{ width: size, height: size }} />;
}
