"use client";

import { useEffect, useState } from "react";
import DashboardNav from "@/components/dashboard/DashboardNav";
import FeatureGate from "@/components/plans/FeatureGate";
import WhiteLabelSettings from "@/components/dashboard/WhiteLabelSettings";
import { useSiteContext } from "@/components/dashboard/SiteContext";
import { usePlan } from "@/components/plans/PlanProvider";

type ApiKey = {
  id: string;
  label: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export default function ApiPage() {
  return (
    <main className="min-h-screen bg-[color:var(--bg)]">
      <DashboardNav />
      <div className="max-w-4xl mx-auto px-4 sm:px-10 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight mb-1">API Access</h1>
          <p className="text-sm text-[color:var(--fg-muted)]">
            Programmatic access to your sites, posts, and subscribers.
          </p>
        </div>
        <FeatureGate feature="api_access">
          <ApiPageContent />
        </FeatureGate>

        <WhiteLabelSection />
      </div>
    </main>
  );
}

function WhiteLabelSection() {
  const { selectedSite } = useSiteContext();
  const { can } = usePlan();
  if (!can("white_label") || !selectedSite) return null;
  return (
    <div className="mt-6">
      <WhiteLabelSettings
        siteId={selectedSite.id}
        siteSlug={selectedSite.slug}
        initialBrand={selectedSite.whiteLabelBrand || ""}
        initialUrl={selectedSite.whiteLabelUrl || ""}
      />
    </div>
  );
}

function ApiPageContent() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdRaw, setCreatedRaw] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/api-keys");
      const data = await res.json();
      if (res.ok) setKeys(data.keys || []);
      else setError(data.error || "Failed to load keys");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (creating || !label.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreatedRaw(data.key);
        setLabel("");
        void load();
      } else {
        setError(data.error || "Failed to create key");
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this API key? Any app using it will stop working.")) return;
    try {
      const res = await fetch(`/api/dashboard/api-keys?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) void load();
      else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to revoke");
      }
    } catch {
      setError("Network error");
    }
  }

  async function copyRaw() {
    if (!createdRaw) return;
    try {
      await navigator.clipboard.writeText(createdRaw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      {/* Just-created key banner */}
      {createdRaw && (
        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h3 className="text-sm font-bold text-emerald-900">Your new API key</h3>
              <p className="text-xs text-emerald-800 mt-0.5">
                Copy it now — for security, we won&apos;t show it again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreatedRaw(null)}
              className="text-emerald-700 hover:text-emerald-900 text-lg leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <code className="flex-1 bg-white border border-emerald-300 rounded-lg px-3 py-2 text-xs font-mono break-all">
              {createdRaw}
            </code>
            <button
              type="button"
              onClick={copyRaw}
              className="shrink-0 px-3 h-9 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
        <h2 className="text-sm font-bold mb-1">Create an API key</h2>
        <p className="text-xs text-[color:var(--fg-subtle)] mb-4">
          Give it a label so you can identify it later (e.g. &quot;Zapier integration&quot;).
        </p>
        <form onSubmit={createKey} className="flex gap-2">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={64}
            placeholder="Label"
            className="flex-1 h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
            required
          />
          <button
            type="submit"
            disabled={creating || !label.trim()}
            className="shrink-0 px-4 h-10 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create key"}
          </button>
        </form>
        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* Keys list */}
      <div className="bg-white border border-[color:var(--border)] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[color:var(--border)]">
          <h2 className="text-sm font-bold">Your keys</h2>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-center text-xs text-[color:var(--fg-subtle)]">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-[color:var(--fg-subtle)]">
            You don&apos;t have any API keys yet.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {keys.map((k) => (
              <li key={k.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{k.label}</div>
                  <div className="text-[11px] text-[color:var(--fg-subtle)] font-mono mt-0.5">
                    {k.prefix}…
                  </div>
                  <div className="text-[11px] text-[color:var(--fg-subtle)] mt-0.5">
                    Created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt
                      ? ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                      : " · Never used"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => revokeKey(k.id)}
                  className="shrink-0 text-xs font-semibold text-red-600 hover:text-red-700"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Docs */}
      <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
        <h2 className="text-sm font-bold mb-1">Quick reference</h2>
        <p className="text-xs text-[color:var(--fg-subtle)] mb-4">
          Authenticate requests with <code className="bg-black/[0.04] px-1 py-0.5 rounded">Authorization: Bearer YOUR_KEY</code>.
          Base URL: <code className="bg-black/[0.04] px-1 py-0.5 rounded">https://buildmy.directory</code>
        </p>

        <div className="space-y-4 text-xs">
          <Endpoint
            method="GET"
            path="/api/v1/sites"
            desc="List all your sites with post counts."
            example={`curl https://buildmy.directory/api/v1/sites \\
  -H "Authorization: Bearer bmd_yourkey"`}
          />
          <Endpoint
            method="GET"
            path="/api/v1/posts?siteId=xxx&limit=50"
            desc="Posts for a site you own. limit max 200."
            example={`curl "https://buildmy.directory/api/v1/posts?siteId=SITE_ID&limit=20" \\
  -H "Authorization: Bearer bmd_yourkey"`}
          />
          <Endpoint
            method="GET"
            path="/api/v1/subscribers?siteId=xxx"
            desc="Newsletter subscribers for a site you own."
            example={`curl "https://buildmy.directory/api/v1/subscribers?siteId=SITE_ID" \\
  -H "Authorization: Bearer bmd_yourkey"`}
          />
        </div>
      </div>
    </div>
  );
}

function Endpoint({
  method,
  path,
  desc,
  example,
}: {
  method: string;
  path: string;
  desc: string;
  example: string;
}) {
  return (
    <div className="border border-[color:var(--border)] rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-black/[0.02] border-b border-[color:var(--border)] flex items-center gap-2">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
          {method}
        </span>
        <code className="text-xs font-mono">{path}</code>
      </div>
      <div className="p-3">
        <p className="text-[color:var(--fg-muted)] mb-2">{desc}</p>
        <pre className="bg-black text-white text-[11px] font-mono rounded-md p-3 overflow-x-auto">
          {example}
        </pre>
      </div>
    </div>
  );
}
