"use client";

import { useCallback } from "react";
import Particles from "react-particles";
import { loadSlim } from "tsparticles-slim";

export default function NetworkBackground() {
  // دالة تهيئة المحرك باستخدام useCallback لضمان الأداء
  const particlesInit = useCallback(async (engine) => {
    await loadSlim(engine);
  }, []);

  return (
    <Particles
      id="tsparticles"
      init={particlesInit}
      className="absolute inset-0 -z-10"
      options={{
        background: {
          color: {
            value: "transparent",
          },
        },
        fpsLimit: 60,
        interactivity: {
          events: {
            onHover: {
              enable: true,
              mode: "grab", // تفاعل الجذب عند مرور الماوس
            },
          },
          modes: {
            grab: {
              distance: 150,
              links: {
                opacity: 0.4,
              },
            },
          },
        },
        particles: {
          color: {
            value: ["#ffffff", "#00e5ff"], // ألوان النقاط
          },
          links: {
            color: "#00e5ff", // لون الخطوط
            distance: 150,
            enable: true,
            opacity: 0.15,
            width: 1,
          },
          move: {
            direction: "none",
            enable: true,
            outModes: {
              default: "bounce",
            },
            random: false,
            speed: 0.6, // سرعة هادئة
            straight: false,
          },
          number: {
            density: {
              enable: true,
              area: 800,
            },
            value: 40,
          },
          opacity: {
            value: 0.3,
          },
          shape: {
            type: "circle",
          },
          size: {
            value: { min: 1, max: 2 },
          },
        },
        detectRetina: true,
      }}
    />
  );
}