import { ImageResponse } from "next/og";
import { getSiteData } from "@/lib/demo-data";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Directory preview";

export default async function OG({ params }: { params: { tenant: string } }) {
  const data = await getSiteData(params.tenant);
  const displayName = data?.site.displayName || params.tenant;
  const bio = data?.site.bio || "A directory of creator content";
  const postCount = data?.posts.length ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "radial-gradient(1000px circle at 0% 0%, #fef3c7 0%, transparent 50%), radial-gradient(1000px circle at 100% 100%, #e0e7ff 0%, transparent 50%), #ffffff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 800,
              fontSize: 22,
            }}
          >
            B
          </div>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#111" }}>
            BuildMy<span style={{ color: "#888" }}>.</span>Directory
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 80,
              fontWeight: 900,
              color: "#0a0a0a",
              letterSpacing: -2,
              lineHeight: 1,
              marginBottom: 24,
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#444",
              lineHeight: 1.3,
              maxWidth: 960,
            }}
          >
            {bio.length > 140 ? `${bio.slice(0, 140)}…` : bio}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 22,
              color: "#555",
              fontWeight: 600,
            }}
          >
            <span
              style={{
                background: "#111",
                color: "#fff",
                padding: "8px 16px",
                borderRadius: 999,
                fontSize: 20,
              }}
            >
              {postCount} posts
            </span>
            <span>Browse now →</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
