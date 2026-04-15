import { ImageResponse } from "next/og";
import { getSiteData } from "@/lib/demo-data";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Post preview";

export default async function OG({
  params,
}: {
  params: { tenant: string; shortcode: string };
}) {
  const data = await getSiteData(params.tenant);
  const post = data?.posts.find((p) => p.shortcode === params.shortcode);

  const siteName = data?.site.displayName || params.tenant;
  const title = post?.title || siteName;
  const caption = (post?.caption || data?.site.bio || "").slice(0, 180);
  const category = post?.category || "Post";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px",
          background:
            "radial-gradient(900px circle at 100% 0%, #fce7f3 0%, transparent 55%), radial-gradient(900px circle at 0% 100%, #ddd6fe 0%, transparent 55%), #ffffff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: "#000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: 20,
              }}
            >
              B
            </div>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>
              {siteName}
            </span>
          </div>
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              background: "#111",
              color: "#fff",
              padding: "6px 14px",
              borderRadius: 999,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            {category}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 900,
              color: "#0a0a0a",
              letterSpacing: -1.5,
              lineHeight: 1.05,
              marginBottom: 24,
            }}
          >
            {title.length > 90 ? `${title.slice(0, 90)}…` : title}
          </div>
          <div style={{ fontSize: 24, color: "#555", lineHeight: 1.35 }}>
            {caption}
          </div>
        </div>

        <div style={{ fontSize: 20, color: "#777", fontWeight: 600 }}>
          Powered by BuildMy.Directory
        </div>
      </div>
    ),
    { ...size },
  );
}
