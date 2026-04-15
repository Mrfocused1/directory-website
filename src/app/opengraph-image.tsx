import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "BuildMy.Directory — Turn your content into a searchable directory";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background:
            "radial-gradient(1000px circle at 0% 0%, #fef3c7 0%, transparent 50%), radial-gradient(1000px circle at 100% 100%, #e0e7ff 0%, transparent 50%), #ffffff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 800,
              fontSize: 24,
            }}
          >
            B
          </div>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>
            BuildMy<span style={{ color: "#888" }}>.</span>Directory
          </span>
        </div>

        <div
          style={{
            fontSize: 80,
            fontWeight: 900,
            color: "#0a0a0a",
            letterSpacing: -2,
            lineHeight: 1.02,
            maxWidth: 1000,
          }}
        >
          Turn your content into a searchable directory
        </div>

        <div
          style={{
            fontSize: 26,
            color: "#555",
            fontWeight: 600,
          }}
        >
          Instagram + TikTok → a beautiful, shareable directory in minutes.
        </div>
      </div>
    ),
    { ...size },
  );
}
