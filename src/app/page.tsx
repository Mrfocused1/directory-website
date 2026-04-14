import Link from "next/link";
import HowItWorks from "@/components/landing/HowItWorks";
import PricingButton from "@/components/landing/PricingButton";
import ContactForm from "@/components/landing/ContactForm";
import Footer from "@/components/landing/Footer";

const FEATURES = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 0 1 9-9" />
      </svg>
    ),
    title: "Auto-Scrape Your Content",
    desc: "Enter your Instagram or TikTok handle. We pull every post, reel, and carousel automatically.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 6V2H8" /><path d="m8 18-4 4V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z" />
      </svg>
    ),
    title: "AI Transcription",
    desc: "Every video is transcribed with AI. Your audience can search inside your spoken content.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
      </svg>
    ),
    title: "Smart References",
    desc: "We find YouTube videos and articles that cover the same topics your content does.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
      </svg>
    ),
    title: "Auto-Categorize",
    desc: "Posts are automatically sorted into categories based on your content themes.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18M9 21V9" />
      </svg>
    ),
    title: "Beautiful Directory",
    desc: "A polished, mobile-first grid with search, filters, pagination, and deep-linkable posts.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    title: "Custom Domain",
    desc: "Get yourname.buildmy.directory or connect your own custom domain.",
  },
];

const PRICING = [
  {
    name: "Free",
    price: "$0",
    period: "",
    features: [
      "1 directory site",
      "Up to 50 posts",
      "1 platform (Instagram or TikTok)",
      "AI transcription",
      "Auto-categorization",
      "yourname.buildmy.directory subdomain",
      "Basic analytics",
    ],
    cta: "Start Free",
    planId: null as string | null,
    highlight: false,
  },
  {
    name: "Creator",
    price: "$19",
    period: "/month",
    features: [
      "1 directory site",
      "Unlimited posts",
      "All platforms (IG + TikTok + YouTube)",
      "AI transcription + references",
      "Full analytics dashboard",
      "Email newsletter & subscribers",
      "Content request board",
      "Visitor bookmark collections",
      "yourname.buildmy.directory subdomain",
    ],
    cta: "Get Started",
    planId: "creator" as string | null,
    highlight: false,
  },
  {
    name: "Pro",
    price: "$39",
    period: "/month",
    features: [
      "Everything in Creator",
      "Custom domain (buy or connect)",
      "SEO meta tags & Open Graph",
      "Priority content processing",
      "AI insights & recommendations",
      "Export subscriber list",
      "Remove BuildMy.Directory branding",
    ],
    cta: "Go Pro",
    planId: "pro" as string | null,
    highlight: true,
  },
  {
    name: "Agency",
    price: "$99",
    period: "/month",
    features: [
      "Everything in Pro",
      "Up to 10 directory sites",
      "Manage multiple creators",
      "White-label option",
      "API access",
      "Dedicated support",
      "Bulk domain purchasing",
    ],
    cta: "Pay Now",
    planId: "agency" as string | null,
    highlight: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen relative">
      {/* Background */}
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />

      <div className="relative z-10">
        {/* Nav */}
        <nav className="flex items-center justify-between px-6 sm:px-10 h-16 max-w-6xl mx-auto">
          <span className="text-lg font-extrabold tracking-tight">
            BuildMy<span className="text-black/40">.</span>Directory
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="#pricing"
              className="hidden sm:inline text-sm font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition"
            >
              Pricing
            </Link>
            <Link
              href="#contact"
              className="hidden sm:inline text-sm font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition"
            >
              Contact
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition"
            >
              Log in
            </Link>
            <Link
              href="/onboarding"
              className="text-sm font-semibold bg-[color:var(--fg)] text-[color:var(--bg)] px-5 py-2.5 rounded-full hover:opacity-90 transition"
            >
              Get Started
            </Link>
          </div>
        </nav>

        {/* Hero */}
        <section className="pt-20 pb-24 px-6 text-center max-w-4xl mx-auto animate-fade-in">
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6">
            Turn your content into a
            <br />
            <span className="gradient-text">searchable directory</span>
          </h1>
          <p className="text-lg sm:text-xl text-[color:var(--fg-muted)] max-w-2xl mx-auto mb-10 leading-relaxed">
            Enter your Instagram or TikTok handle. We automatically scrape your content,
            transcribe your videos, find references, and build you a beautiful, searchable
            directory site — in minutes.
          </p>

          {/* CTA input */}
          <form action="/onboarding" method="GET" className="max-w-md mx-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-2">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--fg-subtle)] text-sm font-medium">@</span>
              <input
                type="text"
                name="handle"
                placeholder="yourhandle"
                aria-label="Instagram or TikTok handle"
                className="w-full h-14 pl-9 pr-4 bg-white border-2 border-[color:var(--border)] rounded-2xl text-lg font-medium placeholder:text-[color:var(--fg-subtle)] focus:outline-none focus:border-[color:var(--fg)] transition"
              />
            </div>
            <button
              type="submit"
              className="h-14 px-8 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-2xl text-base font-semibold flex items-center justify-center hover:opacity-90 transition whitespace-nowrap"
            >
              Build My Directory
            </button>
          </form>
          <p className="mt-4 text-xs text-[color:var(--fg-subtle)]">
            Free to try. No credit card required.
          </p>
        </section>

        {/* Demo preview */}
        <section className="px-6 pb-24 max-w-5xl mx-auto animate-fade-in">
          <div className="relative bg-white rounded-2xl border-2 border-[color:var(--border)] shadow-2xl shadow-black/5 overflow-hidden">
            <div className="flex items-center gap-2 px-4 h-10 border-b border-[color:var(--border)] bg-[color:var(--card)]">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-400/60" />
                <div className="w-3 h-3 rounded-full bg-green-400/60" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="text-xs text-[color:var(--fg-subtle)] bg-black/5 px-4 py-1 rounded-md font-mono">
                  yourname.buildmy.directory
                </div>
              </div>
            </div>
            <div className="p-6 sm:p-10">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-extrabold tracking-tight mb-1">Your Directory</h2>
                <p className="text-sm text-[color:var(--fg-muted)]">
                  Exploring Business, Africa, Economics & Current Affairs
                </p>
              </div>
              {/* Fake grid — 3 cols × 2 rows = 6 tiles */}
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="aspect-[4/5] bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl" />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="pb-24 max-w-5xl mx-auto overflow-hidden scroll-mt-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center mb-4 px-6">
            Everything automated
          </h2>
          <p className="text-center text-[color:var(--fg-muted)] mb-14 max-w-xl mx-auto px-6">
            From scraping to transcription to categorization — we handle the entire pipeline
            so you can focus on creating.
          </p>
          {/* Mobile: horizontal scroll slider */}
          <div className="sm:hidden flex gap-4 overflow-x-auto overflow-y-hidden snap-x snap-mandatory px-6 pb-4 scrollbar-hide max-w-[100vw]">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white border border-[color:var(--border)] rounded-2xl p-6 min-w-[260px] w-[260px] shrink-0 snap-center"
              >
                <div className="w-12 h-12 rounded-xl bg-black/5 flex items-center justify-center text-[color:var(--fg)] mb-4">
                  {f.icon}
                </div>
                <h3 className="text-base font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-[color:var(--fg-muted)] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
          {/* Desktop: grid */}
          <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-6 px-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white border border-[color:var(--border)] rounded-2xl p-6 hover:shadow-lg hover:shadow-black/5 transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-black/5 flex items-center justify-center text-[color:var(--fg)] mb-4">
                  {f.icon}
                </div>
                <h3 className="text-base font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-[color:var(--fg-muted)] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works — with animated demos */}
        <HowItWorks />

        {/* Pricing */}
        <section id="pricing" className="px-6 pb-24 max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center mb-4">
            Simple pricing
          </h2>
          <p className="text-center text-[color:var(--fg-muted)] mb-14">
            Start free. Upgrade when you&apos;re ready.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {PRICING.map((p) => (
              <div
                key={p.name}
                className={`relative bg-white border-2 rounded-2xl p-6 flex flex-col ${
                  p.highlight
                    ? "border-purple-500 shadow-xl shadow-purple-100"
                    : "border-[color:var(--border)]"
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r from-purple-600 to-violet-600 text-white px-3 py-0.5 rounded-full shadow-md shadow-purple-200">
                    Popular
                  </span>
                )}
                <h3 className="text-lg font-bold mb-1">{p.name}</h3>
                <div className="mb-4">
                  <span className="text-4xl font-extrabold">{p.price}</span>
                  <span className="text-sm text-[color:var(--fg-muted)]">{p.period}</span>
                </div>
                <ul className="space-y-2.5 mb-8 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <svg className="w-4 h-4 mt-0.5 text-green-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <PricingButton plan={p.planId} cta={p.cta} highlight={p.highlight} />
              </div>
            ))}
          </div>
        </section>

        {/* Contact */}
        <ContactForm />

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
}
