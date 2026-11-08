import { ImageResponse } from "next/og";

import { LOCALES } from "@/lib/i18n";

// The link-preview image shown when the site is shared on LinkedIn, WhatsApp, X, etc.
export const alt = "Turki Aloufi, Software Engineer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Rendered once per language at build time instead of on every request.
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "radial-gradient(circle at 78% 30%, rgba(0,229,255,0.28), transparent 45%), radial-gradient(circle at 15% 85%, rgba(59,130,246,0.25), transparent 50%), #050A15",
          color: "#F8FAFC",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, color: "#00E5FF", textTransform: "uppercase" }}>
          Portfolio · T.A Core
        </div>
        <div style={{ display: "flex", fontSize: 96, fontWeight: 700, marginTop: 24, lineHeight: 1 }}>Turki Aloufi</div>
        <div style={{ display: "flex", fontSize: 40, marginTop: 28, color: "#94A3B8" }}>
          Software Engineer · AI & Full-Stack Developer
        </div>
        <div style={{ display: "flex", marginTop: 56, fontSize: 28, color: "#F8FAFC" }}>
          <span style={{ color: "#00E5FF", marginRight: 12 }}>●</span> Open to work · Saudi Arabia
        </div>
      </div>
    ),
    size
  );
}
