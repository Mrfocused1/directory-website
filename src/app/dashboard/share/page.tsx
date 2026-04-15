"use client";

import { useState } from "react";
import DashboardNav from "@/components/dashboard/DashboardNav";
import { useSiteContext } from "@/components/dashboard/SiteContext";
import EmptyState from "@/components/dashboard/EmptyState";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://buildmy.directory";

export default function SharePage() {
  const { selectedSite } = useSiteContext();

  if (!selectedSite) {
    return (
      <main className="min-h-screen bg-[color:var(--bg)]">
        <DashboardNav />
        <div className="max-w-2xl mx-auto px-4 sm:px-10 py-8">
          <EmptyState
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51L8.59 10.49" />
              </svg>
            }
            title="No directory selected"
            description="Create a directory to get your public URL, RSS feed, and embed code."
            action={{ href: "/onboarding", label: "Create a directory" }}
          />
        </div>
      </main>
    );
  }

  const slug = selectedSite.slug;
  const directoryUrl = `${SITE_URL}/d/${slug}`;
  const rssUrl = `${directoryUrl}/feed.xml`;
  const embedUrl = `${SITE_URL}/embed/${slug}`;
  const embedSnippet = `<iframe
  src="${embedUrl}"
  title="${selectedSite.displayName || slug} directory"
  width="100%"
  height="800"
  frameborder="0"
  style="border-radius: 12px; border: 1px solid #e5e7eb;"
  loading="lazy"
></iframe>`;

  return (
    <main className="min-h-screen bg-[color:var(--bg)]">
      <DashboardNav />
      <div className="max-w-2xl mx-auto px-4 sm:px-10 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight mb-1">Share &amp; embed</h1>
          <p className="text-sm text-[color:var(--fg-muted)]">
            Spread your directory everywhere your audience lives.
          </p>
        </div>

        <div className="space-y-5">
          <CopyCard
            title="Direct link"
            description="Share this URL anywhere — bio links, socials, email."
            value={directoryUrl}
          />

          <CopyCard
            title="RSS feed"
            description="Readers like Feedly, email newsletters, and automation tools can subscribe to new posts."
            value={rssUrl}
          />

          <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
            <h2 className="text-sm font-bold mb-1">Embed on your website</h2>
            <p className="text-xs text-[color:var(--fg-subtle)] mb-3">
              Paste this snippet into any HTML page or site builder to show a live copy of your directory.
            </p>
            <CodeBlock value={embedSnippet} />
            <div className="mt-3 flex items-center gap-2 text-[11px] text-[color:var(--fg-subtle)]">
              <span>Embed URL:</span>
              <code className="bg-black/[0.04] px-1.5 py-0.5 rounded font-mono">{embedUrl}</code>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function CopyCard({ title, description, value }: { title: string; description: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };
  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
      <h2 className="text-sm font-bold mb-1">{title}</h2>
      <p className="text-xs text-[color:var(--fg-subtle)] mb-3">{description}</p>
      <div className="flex gap-2">
        <code className="flex-1 bg-black/[0.04] rounded-lg px-3 py-2 text-xs font-mono truncate">{value}</code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 h-9 px-3 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold hover:opacity-90 transition"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function CodeBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };
  return (
    <div className="relative">
      <pre className="bg-black text-white text-[11px] font-mono rounded-lg p-4 overflow-x-auto whitespace-pre">
        {value}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-2 right-2 h-7 px-2.5 bg-white/10 text-white rounded text-[11px] font-semibold hover:bg-white/20 transition"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
