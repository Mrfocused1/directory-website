import Link from "next/link";
import type { SiteBranding } from "@/lib/demo-data";

/**
 * Footer badge shown on tenant directory pages.
 *
 * Behaviour by plan:
 *  - Free / Creator:        "Powered by BuildMy.Directory"
 *  - Pro (remove_branding): hidden completely
 *  - Agency (white_label):  custom brand name + link if set, else hidden
 */
export default function DirectoryBranding({ branding }: { branding: SiteBranding }) {
  // Agency with configured white-label brand
  if (branding.customBrandName) {
    const content = (
      <span className="inline-flex items-center gap-1.5">
        <span>Powered by</span>
        <span className="font-semibold">{branding.customBrandName}</span>
      </span>
    );
    return (
      <div className="text-center mt-14 mb-4 text-xs text-[color:var(--fg-subtle)]">
        {branding.customBrandUrl ? (
          <a
            href={branding.customBrandUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="hover:text-[color:var(--fg-muted)] transition"
          >
            {content}
          </a>
        ) : (
          content
        )}
      </div>
    );
  }

  // Hidden for Pro+ without white-label configured
  if (!branding.showPoweredBy) return null;

  // Default: BuildMy.Directory credit for Free / Creator plans
  return (
    <div className="text-center mt-14 mb-4 text-xs text-[color:var(--fg-subtle)]">
      <Link
        href="https://buildmy.directory"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-[color:var(--fg-muted)] transition inline-flex items-center gap-1.5"
      >
        <span>Powered by</span>
        <span className="font-semibold">BuildMy.Directory</span>
      </Link>
    </div>
  );
}
