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
    color: "bg-black",
    title: "Enter your handle",
    desc: "Paste your Instagram, TikTok, or YouTube username. You can connect multiple platforms to merge all your content into one directory.",
    detail: null,
    tags: [
      { label: "Instagram", color: "bg-pink-100 text-pink-700" },
      { label: "TikTok", color: "bg-gray-100 text-gray-700" },
      { label: "YouTube", color: "bg-red-100 text-red-700" },
    ],
    Demo: DemoHandleInput,
  },
  {
    num: "2",
    color: "bg-black",
    title: "We scrape, transcribe & categorize",
    desc: "Our AI pipeline pulls every post, transcribes your videos, auto-categorizes content by topic, and finds related YouTube videos and articles as references.",
    detail: "This usually takes 2-5 minutes depending on how much content you have.",
    tags: null,
    Demo: DemoPipeline,
  },
  {
    num: "3",
    color: "bg-black",
    title: "Your directory goes live",
    desc: "Instantly deployed at yourname.buildmy.directory with search, filters, pagination, and deep links. Share it in your bio.",
    detail: null,
    tags: null,
    Demo: DemoDirectoryGrid,
  },
  {
    num: "4",
    color: "bg-gradient-to-br from-purple-600 to-violet-600",
    title: "Add your custom domain",
    desc: "Buy a new domain directly through us (we handle DNS and SSL automatically) or connect one you already own with 3 simple DNS records.",
    detail: "Domains start from $2.99/year. Or connect your own for free.",
    tags: null,
    Demo: DemoDomainSetup,
  },
  {
    num: "5",
    color: "bg-gradient-to-br from-blue-600 to-sky-600",
    title: "Grow your email subscribers",
    desc: "Visitors subscribe to your directory with their email. They choose which topics to follow and how often to get updates — daily, weekly, or monthly.",
    detail: "We send beautiful digest emails automatically with your latest posts. You see subscriber counts, open rates, and click rates in your dashboard.",
    tags: null,
    Demo: DemoEmailGrowth,
  },
  {
    num: "6",
    color: "bg-gradient-to-br from-green-600 to-emerald-600",
    title: "Track everything in your dashboard",
    desc: "See what visitors search for, which posts get the most clicks, where your traffic comes from, and what content your audience wants next with the request board.",
    detail: "Analytics, subscriber management, content requests, platform connections — all in one place.",
    tags: null,
    Demo: DemoDashboard,
  },
];

export default function HowItWorks() {
  return (
    <section className="px-6 pb-24 max-w-4xl mx-auto">
      <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center mb-4">
        How it works
      </h2>
      <p className="text-center text-[color:var(--fg-muted)] mb-14 max-w-xl mx-auto">
        From sign-up to a fully branded directory with subscribers — here&apos;s the journey.
      </p>

      <div className="space-y-10 sm:space-y-14">
        {STEPS.map((s, i) => {
          const isEven = i % 2 === 0;
          return (
            <div
              key={s.num}
              className={`flex flex-col ${isEven ? "sm:flex-row" : "sm:flex-row-reverse"} gap-5 sm:gap-8 items-center`}
            >
              {/* Text side */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl ${s.color} text-white text-base sm:text-lg font-bold flex items-center justify-center shrink-0 shadow-lg`}>
                    {s.num}
                  </div>
                  <h3 className="text-base sm:text-lg font-bold">{s.title}</h3>
                </div>
                <p className="text-sm text-[color:var(--fg-muted)] leading-relaxed mb-2">
                  {s.desc}
                </p>
                {s.detail && (
                  <p className="text-xs text-[color:var(--fg-subtle)] bg-black/[0.03] px-3 py-2 rounded-lg mb-2">
                    {s.detail}
                  </p>
                )}
                {s.tags && (
                  <div className="flex items-center gap-2 mt-2">
                    {s.tags.map((tag) => (
                      <span key={tag.label} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tag.color}`}>
                        {tag.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Demo side — fixed height to prevent layout shifts */}
              <div className="w-full sm:w-52 h-[160px] shrink-0">
                <s.Demo />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
