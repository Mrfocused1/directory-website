"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

type Subscriber = {
  email: string;
  name: string | null;
  frequency: "daily" | "weekly" | "monthly";
  categories: string[];
  isActive: boolean;
  isVerified: boolean;
};

export default function PreferencesPage() {
  return (
    <Suspense fallback={null}>
      <PreferencesContent />
    </Suspense>
  );
}

function PreferencesContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tenant = params.tenant as string;
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscriber, setSubscriber] = useState<Subscriber | null>(null);
  const [available, setAvailable] = useState<string[]>([]);
  const [frequency, setFrequency] = useState<Subscriber["frequency"]>("weekly");
  const [categories, setCategories] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [unsubscribed, setUnsubscribed] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("This preferences link is missing a token.");
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(
          `/api/subscribe/preferences?siteId=${encodeURIComponent(tenant)}&token=${encodeURIComponent(token)}`,
        );
        const data = await res.json();
        if (res.ok) {
          setSubscriber(data.subscriber);
          setFrequency(data.subscriber.frequency);
          setCategories(data.subscriber.categories || []);
          setAvailable(data.availableCategories || []);
        } else {
          setError(data.error || "Invalid link.");
        }
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
      }
    })();
  }, [tenant, token]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (status === "saving") return;
    setStatus("saving");
    try {
      const res = await fetch("/api/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: tenant,
          token,
          frequency,
          categories,
        }),
      });
      if (res.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2500);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  async function unsubscribe() {
    if (!confirm("Stop receiving emails from this directory?")) return;
    const res = await fetch("/api/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: tenant, token }),
    });
    if (res.ok) setUnsubscribed(true);
  }

  function toggleCategory(c: string) {
    setCategories((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  }

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dotted-bg pointer-events-none" aria-hidden />
      <div className="fixed inset-0 bg-gradient-to-br from-white/70 via-white/30 to-white/70 pointer-events-none" aria-hidden />
      <div className="relative z-10 max-w-md mx-auto px-6 pt-16 pb-20">
        <h1 className="text-3xl font-extrabold tracking-tight mb-2 text-center">
          Email preferences
        </h1>
        <p className="text-[color:var(--fg-muted)] text-center mb-8">
          Tailor how often you hear from us and what you hear about.
        </p>

        {loading ? (
          <div className="text-center text-sm text-[color:var(--fg-muted)]">Loading...</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl px-4 py-3 text-center">
            {error}
          </div>
        ) : unsubscribed ? (
          <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-4 py-4 text-center">
            You&apos;ve been unsubscribed.{" "}
            <Link href={`/${tenant}`} className="font-semibold underline">
              Back to directory
            </Link>
          </div>
        ) : (
          subscriber && (
            <form onSubmit={save} className="space-y-6">
              <div className="bg-white border border-[color:var(--border)] rounded-xl p-4 text-center">
                <p className="text-xs text-[color:var(--fg-subtle)]">Managing emails for</p>
                <p className="text-sm font-semibold">{subscriber.email}</p>
                {!subscriber.isVerified && (
                  <p className="text-[11px] text-yellow-700 mt-1">
                    Email not yet verified — check your inbox for the link.
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-semibold mb-2 block">How often?</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["daily", "weekly", "monthly"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFrequency(f)}
                      className={`h-10 rounded-lg text-xs font-semibold capitalize border-2 transition ${
                        frequency === f
                          ? "border-[color:var(--fg)] bg-black/5"
                          : "border-[color:var(--border)] hover:border-[color:var(--fg-muted)]"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {available.length > 0 && (
                <div>
                  <label className="text-sm font-semibold mb-2 block">
                    Topics you care about
                  </label>
                  <p className="text-[11px] text-[color:var(--fg-subtle)] mb-2">
                    Select none to receive all topics.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {available.map((c) => {
                      const selected = categories.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleCategory(c)}
                          className={`h-8 px-3 text-xs font-semibold rounded-lg border-2 transition ${
                            selected
                              ? "border-[color:var(--fg)] bg-[color:var(--fg)] text-[color:var(--bg)]"
                              : "border-[color:var(--border)] hover:border-[color:var(--fg-muted)]"
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={status === "saving"}
                  className="w-full h-12 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
                >
                  {status === "saving"
                    ? "Saving..."
                    : status === "saved"
                      ? "Saved ✓"
                      : "Save preferences"}
                </button>
                <button
                  type="button"
                  onClick={unsubscribe}
                  className="w-full h-10 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  Unsubscribe from all emails
                </button>
              </div>
            </form>
          )
        )}
      </div>
    </div>
  );
}
