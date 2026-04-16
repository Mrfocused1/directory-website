import Link from "next/link";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import HowItWorks from "@/components/landing/HowItWorks";
import PricingButton from "@/components/landing/PricingButton";
import ContactForm from "@/components/landing/ContactForm";
import AutoScrapeDemo from "@/components/marketing/demos/AutoScrapeDemo";
import TranscriptionDemo from "@/components/marketing/demos/TranscriptionDemo";
import ReferencesDemo from "@/components/marketing/demos/ReferencesDemo";
import CategorizeDemo from "@/components/marketing/demos/CategorizeDemo";

/**
 * Landing page — nory.ai-inspired aesthetic.
 *
 * Color palette + typography sourced directly from nory.ai's CSS
 * (Space Grotesk / Inter substitute for their commercial Sharp
 * Grotesk / Graphik). Applied ONLY here + /privacy + /terms; tenant
 * directories, admin, and dashboard keep their own theme.
 */

const FEATURES: {
  eyebrow: string;
  accent: string;
  title: string;
  desc: string;
  Demo: React.ComponentType;
}[] = [
  {
    eyebrow: "Auto-scrape",
    accent: "#d3fd74",
    title: "We pull every post, reel and carousel.",
    desc: "Enter your Instagram or TikTok handle. We do the scraping, the uploading, and the thumbnail prep. You don't touch anything.",
    Demo: AutoScrapeDemo,
  },
  {
    eyebrow: "AI transcription",
    accent: "#b0b0fe",
    title: "Your videos become searchable text.",
    desc: "We transcribe every reel automatically. Your audience can search what you SAID, not just your captions — and Google indexes it all.",
    Demo: TranscriptionDemo,
  },
  {
    eyebrow: "Smart references",
    accent: "#92eedd",
    title: "We find the sources you'd have cited.",
    desc: "We read every post and pull in related YouTube videos and articles. Credibility at scale, no manual sourcing.",
    Demo: ReferencesDemo,
  },
  {
    eyebrow: "Auto-categorize",
    accent: "#ffc72d",
    title: "Niche-specific tabs, not generic junk.",
    desc: "We detect your niche first, then generate categories that fit. No 'General' or 'Updates' dumps — real tags your audience actually wants.",
    Demo: CategorizeDemo,
  },
];

const PRICING = [
  {
    name: "Free",
    price: "$0",
    period: "",
    tagline: "Try it out.",
    features: [
      "1 directory site",
      "Up to 9 posts (one-shot build)",
      "1 Instagram or TikTok account",
      "AI transcription",
      "Smart references (articles + YouTube)",
      "Auto-categorization",
      "Search, filters, post modal",
      "RSS feed + embed widget",
      "buildmy.directory/yourname URL",
      "No ongoing sync — upgrade for that",
    ],
    cta: "Start free",
    planId: null as string | null,
    highlight: false,
  },
  {
    name: "Creator",
    price: "$19",
    period: "/mo",
    tagline: "Everything in Free, plus…",
    features: [
      "Up to 100 posts",
      "30 syncs per month (~1/day)",
      "Instagram + TikTok + YouTube",
      "Custom domain (buy or connect)",
      "DNS + SSL auto-provisioning",
      "Full analytics dashboard",
      "Email newsletter & subscribers",
      "Scheduled weekly digests",
      "Content request board + voting",
      "Visitor bookmark collections",
      "Smart references",
    ],
    cta: "Get started",
    planId: "creator" as string | null,
    highlight: false,
  },
  {
    name: "Pro",
    price: "$39",
    period: "/mo",
    tagline: "Everything in Creator, plus…",
    features: [
      "Up to 500 posts",
      "100 syncs per month (~3/day)",
      "Full SEO: sitemap, JSON-LD, canonicals",
      "Dynamic Open Graph preview images",
      "Search-term & audience insights",
      "Export subscriber list as CSV",
      "Remove BuildMy.Directory branding",
    ],
    cta: "Go Pro",
    planId: "pro" as string | null,
    highlight: true,
  },
  {
    name: "Agency",
    price: "$99",
    period: "/mo",
    tagline: "Everything in Pro, plus…",
    features: [
      "Unlimited posts",
      "500 syncs per month across all sites",
      "Up to 10 directory sites",
      "5 accounts per platform (multi-creator)",
      "Full white-label branding",
      "Priority email support",
    ],
    cta: "Get Agency",
    planId: "agency" as string | null,
    highlight: false,
  },
];

export default function LandingPage() {
  return (
    <div className="marketing-theme min-h-screen">
      {/* ── HERO (dark purple) ─────────────────────────────────────── */}
      <div className="bg-[color:var(--bd-dark)] text-white">
        <MarketingNav />

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 hero-glow pointer-events-none" aria-hidden />
          <div className="relative max-w-[90rem] mx-auto px-6 sm:px-10 pt-24 pb-32 grid lg:grid-cols-[1.1fr_1fr] gap-16 items-center">
            <div>
              <h1 className="font-display-tight text-[3.25rem] sm:text-[4.5rem] lg:text-[5.75rem] text-white mb-6">
                Your content,
                <br />
                fully searchable.
              </h1>

              <p className="text-lg text-white/75 leading-relaxed max-w-xl mb-10">
                Turn your Instagram or TikTok feed into a beautiful, searchable directory
                your audience can explore. Transcribed, categorized, cross-referenced —
                all done for you in minutes.
              </p>

              <div className="flex items-center gap-3 flex-wrap">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center h-12 px-6 rounded-full bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)] text-base font-semibold hover:opacity-90 transition"
                >
                  Start free
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex items-center gap-2 h-12 px-6 rounded-full border border-white/20 text-white text-base font-medium hover:bg-white/5 transition"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Watch demo
                </Link>
              </div>

              <p className="mt-6 text-sm text-white/50">
                Free to try. No credit card required.
              </p>
            </div>

            {/* Device mockup — pastiche of nory's phone-on-warm-bg */}
            <div className="relative">
              <div className="aspect-[4/5] bg-gradient-to-br from-[color:var(--bd-maroon)] via-[color:var(--bd-purple)] to-[color:var(--bd-dark)] rounded-[2rem] p-6 shadow-2xl overflow-hidden">
                <div className="h-full bg-[color:var(--bd-cream)] rounded-[1.5rem] p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-[color:var(--bd-grey)]">
                      buildmy.directory/you
                    </span>
                    <span className="w-6 h-6 rounded-full bg-[color:var(--bd-lime)] flex items-center justify-center text-[color:var(--bd-dark)] text-xs font-bold">
                      Y
                    </span>
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    {[
                      "bg-[color:var(--bd-lilac)]",
                      "bg-[color:var(--bd-lime)]",
                      "bg-[color:var(--bd-maroon)]",
                      "bg-[color:var(--bd-purple)]",
                      "bg-[color:var(--bd-green)]",
                      "bg-[color:var(--bd-cream-2)]",
                    ].map((cls, i) => (
                      <div key={i} className={`rounded-xl ${cls} aspect-square`} />
                    ))}
                  </div>
                  <div className="mt-3 bg-white rounded-xl px-3 py-2 flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[color:var(--bd-grey)]">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                    </svg>
                    <span className="text-xs text-[color:var(--bd-grey)]">Search posts…</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── "Results you can see" stats strip ─────────────────────── */}
      <section className="bg-[color:var(--bd-cream)] py-24">
        <div className="max-w-[90rem] mx-auto px-6 sm:px-10">
          <h2 className="font-display-tight text-center text-[color:var(--bd-dark)] text-[2.75rem] sm:text-[4rem] lg:text-[5rem] mb-20">
            Built for creators
            <br />
            who actually ship.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[color:var(--bd-dark-faded)]">
            <Stat label="Auto-scrape" accent="#d3fd74" big="5min" sub="From signup to published directory — typical." />
            <Stat label="Searchable" accent="#b0b0fe" big="∞" sub="Every word you say on camera becomes indexable by Google." />
            <Stat label="Manual work" accent="#ffc72d" big="0" sub="We scrape, transcribe, categorize and ship. You keep creating." />
          </div>
        </div>
      </section>

      {/* ── Feature cards (nory style: eyebrow + bold headline + dark mockup) ── */}
      <section id="how" className="bg-[color:var(--bd-cream)] pb-24">
        <div className="max-w-[90rem] mx-auto px-6 sm:px-10 space-y-6">
          {FEATURES.map((f, i) => (
            <div
              key={f.eyebrow}
              className="bg-white rounded-[2rem] p-8 sm:p-12 grid md:grid-cols-[1fr_1fr] gap-10 items-center"
            >
              <div className={i % 2 === 1 ? "md:order-2" : ""}>
                <div className="eyebrow text-[color:var(--bd-dark)] mb-4">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.accent }} />
                  {f.eyebrow}
                </div>
                <h3 className="font-display-tight text-[color:var(--bd-dark)] text-[2rem] sm:text-[2.75rem] mb-4">
                  {f.title}
                </h3>
                <p className="text-[color:var(--bd-grey)] leading-relaxed text-base max-w-md">
                  {f.desc}
                </p>
              </div>
              <div className={i % 2 === 1 ? "md:order-1" : ""}>
                <f.Demo />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works (existing component reused inside theme) ─── */}
      <section className="bg-[color:var(--bd-cream)]">
        <HowItWorks />
      </section>

      {/* ── Pricing ───────────────────────────────────────────────── */}
      <section id="pricing" className="bg-[color:var(--bd-dark)] text-white py-24">
        <div className="max-w-[90rem] mx-auto px-6 sm:px-10">
          <div className="text-center mb-16">
            <div className="eyebrow text-white/60 mb-4 justify-center inline-flex">
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--bd-lime)]" />
              Pricing
            </div>
            <h2 className="font-display-tight text-[2.75rem] sm:text-[4rem] lg:text-[5rem] mb-4">
              Start free.
              <br />
              Upgrade when ready.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRICING.map((p) => (
              <div
                key={p.name}
                className={`relative rounded-[1.25rem] p-6 flex flex-col ${
                  p.highlight
                    ? "bg-[color:var(--bd-lime)] text-[color:var(--bd-dark)]"
                    : "bg-white/5 border border-white/10 text-white"
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-6 text-[10px] font-bold uppercase tracking-widest bg-[color:var(--bd-dark)] text-[color:var(--bd-lime)] px-3 py-1 rounded-full">
                    Most popular
                  </span>
                )}
                <h3 className="font-display-tight text-2xl mb-2">{p.name}</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="font-display-tight text-[3rem] leading-none">{p.price}</span>
                  <span className={`text-sm ${p.highlight ? "text-[color:var(--bd-dark)]/70" : "text-white/60"}`}>
                    {p.period}
                  </span>
                </div>
                <p className={`text-xs mb-6 ${p.highlight ? "text-[color:var(--bd-dark)]/70" : "text-white/60"}`}>
                  {p.tagline}
                </p>
                <ul className="space-y-2.5 mb-8 flex-1 text-sm">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <span className={`shrink-0 mt-[5px] w-1.5 h-1.5 rounded-full ${
                        p.highlight ? "bg-[color:var(--bd-dark)]" : "bg-[color:var(--bd-lime)]"
                      }`} />
                      <span className={p.highlight ? "text-[color:var(--bd-dark)]/85" : "text-white/85"}>
                        {feat}
                      </span>
                    </li>
                  ))}
                </ul>
                <PricingButton plan={p.planId} cta={p.cta} highlight={p.highlight} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact (existing, wrapped in cream bg) ───────────────── */}
      <section id="contact" className="bg-[color:var(--bd-cream)] py-24">
        <ContactForm />
      </section>

      <MarketingFooter />
    </div>
  );
}

function Stat({
  label,
  accent,
  big,
  sub,
}: {
  label: string;
  accent: string;
  big: string;
  sub: string;
}) {
  return (
    <div className="bg-[color:var(--bd-cream)] p-8 sm:p-12 text-center">
      <div className="eyebrow text-[color:var(--bd-dark)] justify-center mb-6">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
        {label}
      </div>
      <div className="font-display-tight text-[color:var(--bd-dark)] text-[4.5rem] sm:text-[6rem] leading-none mb-4">
        {big}
      </div>
      <p className="text-sm text-[color:var(--bd-grey)] max-w-[220px] mx-auto">{sub}</p>
    </div>
  );
}
