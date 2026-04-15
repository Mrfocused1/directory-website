import Image from "next/image";

/**
 * Single source of truth for the brand logo across the site.
 *
 * The SVG ships in /public as two variants:
 *   - logo.svg       — dark navy, for light backgrounds
 *   - logo-white.svg — inverted, for dark backgrounds
 *
 * The viewBox is 250×131 (≈ 1.9:1). All sizing below preserves that
 * ratio — pass `height` in px and width is computed.
 *
 * Usage:
 *   <Logo height={32} />            // light bg, 32px tall
 *   <Logo height={32} variant="white" />  // dark bg
 */
export default function Logo({
  height = 32,
  variant = "dark",
  className = "",
  priority = false,
}: {
  height?: number;
  variant?: "dark" | "white";
  className?: string;
  priority?: boolean;
}) {
  const RATIO = 250 / 131;
  const width = Math.round(height * RATIO);
  const src = variant === "white" ? "/logo-white.svg" : "/logo.svg";
  return (
    <Image
      src={src}
      alt="BuildMy.Directory"
      width={width}
      height={height}
      priority={priority}
      className={className}
      style={{ height, width }}
    />
  );
}
