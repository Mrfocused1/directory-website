import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";

/**
 * Layout for /privacy and /terms. Dark header (same MarketingNav as
 * the landing page), cream body with the long-form text set in
 * Inter, title set in Space Grotesk (via font-display-tight).
 */
export default function LegalLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="marketing-theme min-h-screen flex flex-col">
      <div className="bg-[color:var(--bd-dark)] text-white">
        <MarketingNav />
      </div>

      <main className="flex-1 bg-[color:var(--bd-cream)]">
        <div className="max-w-3xl mx-auto px-6 sm:px-10 py-20">
          <header className="mb-12">
            <h1 className="font-display-tight text-[2.75rem] sm:text-[4rem] text-[color:var(--bd-dark)] mb-4">
              {title}
            </h1>
            <p className="text-sm text-[color:var(--bd-grey)]">
              Last updated: {lastUpdated}
            </p>
          </header>

          <article
            className="prose prose-sm sm:prose-base max-w-none
                       prose-headings:font-display-tight
                       prose-headings:text-[color:var(--bd-dark)]
                       prose-headings:tracking-tight
                       prose-p:text-[color:var(--bd-grey)]
                       prose-p:leading-relaxed
                       prose-li:text-[color:var(--bd-grey)]
                       prose-strong:text-[color:var(--bd-dark)]
                       prose-a:text-[color:var(--bd-dark)]
                       prose-a:underline
                       prose-a:decoration-[color:var(--bd-lime)]
                       prose-a:decoration-2
                       prose-a:underline-offset-2
                       prose-a:hover:opacity-80"
          >
            {children}
          </article>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
