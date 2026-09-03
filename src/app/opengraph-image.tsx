import { ImageResponse } from "next/og";
import { site } from "@/config/site";

export const alt = `${site.name} — eco-friendly cleaning`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Branded social share image (also used as the schema logo/image). */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #16543a 0%, #1f6d4c 100%)",
          color: "#fff",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 999,
              background: "#fff",
              color: "#1f6d4c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
            }}
          >
            ♻
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>
            <span>mcs</span>
            <span style={{ opacity: 0.75 }}>eco</span>
            <span>cleaning</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 62,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -1,
            }}
          >
            <div style={{ display: "flex" }}>Eco-friendly cleaning,</div>
            <div style={{ display: "flex" }}>priced online in minutes</div>
          </div>
          <div style={{ fontSize: 30, opacity: 0.9 }}>
            Published prices · Photographic proof · Re-clean guarantee
          </div>
        </div>

        <div style={{ display: "flex", gap: 28, fontSize: 24, opacity: 0.9 }}>
          <span>🛡️ £5m public liability</span>
          <span>✅ DBS-checked crews</span>
          <span>♻️ Non-toxic products</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
