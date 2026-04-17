import type { ReactNode } from "react";

/**
 * Shared aspect-ratio + padding wrapper for the four feature-section
 * demos. Accent color tints the background with a soft radial glow
 * matching the eyebrow color from the parent card.
 */
export default function DemoFrame({
  children,
  accent,
  className = "",
}: {
  children: ReactNode;
  accent: string;
  className?: string;
}) {
  return (
    <div
      className={`aspect-square sm:aspect-[5/4] rounded-2xl relative overflow-hidden ${className}`}
      style={{ backgroundColor: accent + "22" }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, ${accent}50 0%, transparent 75%)`,
        }}
        aria-hidden
      />
      <div className="relative w-full h-full p-5 sm:p-7 flex flex-col">
        {children}
      </div>
    </div>
  );
}
