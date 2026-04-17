"use client";

import {
  DemoHandleInput,
  DemoPipeline,
  DemoDirectoryGrid,
  DemoDomainSetup,
  DemoEmailGrowth,
  DemoDashboard,
} from "./StepDemos";

const STEPS = [
  {
    num: "1",
    accent: "#d3fd74",
    eyebrow: "Get started",
    title: "Enter your handle",
    desc: "Paste your Instagram username. We pull your content and build your directory automatically.",
    detail: null,
    tags: [
      { label: "Instagram", color: "bg-pink-500/15 text-pink-300" },
    ],
    Demo: DemoHandleInput,
  },
  {
    num: "2",
    accent: "#b0b0fe",
    eyebrow: "AI pipeline",
    title: "We scrape, transcribe & categorize",
    desc: "Our AI pipeline pulls every post, transcribes your videos, auto-categorizes content by topic, and finds related YouTube videos and articles as references.",
    detail: "This usually takes 2-5 minutes depending on how much content you have.",
    tags: null,
    Demo: DemoPipeline,
  },
  {
    num: "3",
    accent: "#92eedd",
    eyebrow: "Go live",
    title: "Your directory goes live",
    desc: "Instantly deployed at buildmy.directory/yourname with search, filters, pagination, and deep links. Share it in your bio.",
    detail: null,
    tags: null,
    Demo: DemoDirectoryGrid,
  },
  {
    num: "4",
    accent: "#ffc72d",
    eyebrow: "Brand it",
    title: "Add your custom domain",
    desc: "Connect a domain you already own with 3 simple DNS records. We handle SSL automatically.",
    detail: null,
    tags: null,
    Demo: DemoDomainSetup,
  },
  {
    num: "5",
    accent: "#b0b0fe",
    eyebrow: "Grow",
    title: "Grow your email subscribers",
    desc: "Visitors subscribe to your directory with their email. They choose which topics to follow and how often to get updates — daily, weekly, or monthly.",
    detail: "We send beautiful digest emails automatically with your latest posts.",
    tags: null,
    Demo: DemoEmailGrowth,
  },
  {
    num: "6",
    accent: "#d3fd74",
    eyebrow: "Measure",
    title: "Track everything in your dashboard",
    desc: "See what visitors search for, which posts get the most clicks, where your traffic comes from, and what content your audience wants next.",
    detail: null,
    tags: null,
    Demo: DemoDashboard,
  },
];

export default function HowItWorks() {
  return (
    <section className="bg-[color:var(--bd-dark)] px-6 sm:px-10 pb-24 pt-20">
      <div className="max-w-[90rem] mx-auto">
        <div className="text-center mb-16">
          <div className="eyebrow text-white/60 justify-center mb-4 inline-flex">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--bd-lime)]" />
            How it works
          </div>
          <h2 className="font-display-tight text-white text-[2.75rem] sm:text-[4rem] lg:text-[5rem]">
            From sign-up to live
            <br />
            in 5 minutes.
          </h2>
        </div>

        <div className="space-y-6">
          {STEPS.map((s, i) => (
            <div
              key={s.num}
              className="bg-white/[0.04] border border-white/[0.06] rounded-[2rem] p-8 sm:p-12 grid md:grid-cols-[1fr_1fr] gap-10 items-center"
            >
              <div className={i % 2 === 1 ? "md:order-2" : ""}>
                <div className="eyebrow text-white/60 mb-4">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: s.accent }}
                  />
                  Step {s.num} — {s.eyebrow}
                </div>
                <h3 className="font-display-tight text-white text-[1.75rem] sm:text-[2.25rem] mb-4">
                  {s.title}
                </h3>
                <p className="text-white/55 leading-relaxed text-base max-w-md mb-3">
                  {s.desc}
                </p>
                {s.detail && (
                  <p className="text-sm text-white/40 bg-white/[0.04] px-4 py-2.5 rounded-xl mb-3 border border-white/[0.06]">
                    {s.detail}
                  </p>
                )}
                {s.tags && (
                  <div className="flex items-center gap-2 mt-2">
                    {s.tags.map((tag) => (
                      <span
                        key={tag.label}
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${tag.color}`}
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div
                className={`${i % 2 === 1 ? "md:order-1" : ""} w-full h-[180px] sm:h-[200px]`}
                aria-hidden="true"
              >
                <s.Demo />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
