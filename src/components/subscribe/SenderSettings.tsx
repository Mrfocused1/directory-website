"use client";

import { useEffect, useState, useCallback } from "react";

type Props = {
  siteId: string;
  initialFromName: string;
  initialReplyTo: string;
};

type DnsRecord = {
  type: string;
  name: string;
  value: string;
  purpose: string;
};

type SenderConfig = {
  senderEmail: string | null;
  senderVerified: boolean;
  senderDomain: string | null;
  senderDomainVerified: boolean;
};

/**
 * Per-site newsletter sender settings.
 * Lets the creator customise:
 *  - From name (display label on the sender line)
 *  - Reply-to email (where subscribers' replies land)
 *  - Sender email (verified custom from address)
 *  - Sender domain (custom sending domain with DNS records)
 *
 * Stored on the sites row (newsletterFromName, newsletterReplyTo,
 * senderEmail, senderVerified, senderDomain, senderDomainVerified).
 */
export default function SenderSettings({ siteId, initialFromName, initialReplyTo }: Props) {
  const [fromName, setFromName] = useState(initialFromName);
  const [replyTo, setReplyTo] = useState(initialReplyTo);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  // Sender verification state
  const [senderConfig, setSenderConfig] = useState<SenderConfig>({
    senderEmail: null,
    senderVerified: false,
    senderDomain: null,
    senderDomainVerified: false,
  });
  const [emailInput, setEmailInput] = useState("");
  const [domainInput, setDomainInput] = useState("");
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
  const [senderStatus, setSenderStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [senderError, setSenderError] = useState("");
  const [activeTab, setActiveTab] = useState<"email" | "domain">("email");

  useEffect(() => {
    setFromName(initialFromName);
    setReplyTo(initialReplyTo);
  }, [initialFromName, initialReplyTo, siteId]);

  // Fetch current sender config
  const fetchSenderConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/sender?siteId=${encodeURIComponent(siteId)}`);
      if (res.ok) {
        const data = await res.json();
        setSenderConfig(data);
        if (data.senderEmail) setEmailInput(data.senderEmail);
        if (data.senderDomain) setDomainInput(data.senderDomain);
      }
    } catch {
      // Silently fail — the section will show defaults
    }
  }, [siteId]);

  useEffect(() => {
    fetchSenderConfig();
  }, [fetchSenderConfig]);

  // Check for verification success from redirect
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("sender_verified") === "1") {
        // Refresh the sender config to show verified state
        fetchSenderConfig();
        // Clean up the URL
        const url = new URL(window.location.href);
        url.searchParams.delete("sender_verified");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [fetchSenderConfig]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "saving") return;
    setStatus("saving");
    setError("");
    try {
      const res = await fetch(`/api/sites?id=${encodeURIComponent(siteId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newsletterFromName: fromName.trim() || null,
          newsletterReplyTo: replyTo.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setStatus("error");
        setError(data?.error || "Failed to save");
      }
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  };

  const handleVerifyEmail = async () => {
    if (!emailInput.trim()) return;
    setSenderStatus("loading");
    setSenderError("");
    try {
      const res = await fetch("/api/dashboard/sender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, action: "verify-email", email: emailInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSenderConfig((prev) => ({ ...prev, senderEmail: data.senderEmail, senderVerified: false }));
        setSenderStatus("success");
        setSenderError("");
      } else {
        setSenderStatus("error");
        setSenderError(data.error || "Failed to send verification");
      }
    } catch {
      setSenderStatus("error");
      setSenderError("Network error. Please try again.");
    }
  };

  const handleVerifyDomain = async () => {
    if (!domainInput.trim()) return;
    setSenderStatus("loading");
    setSenderError("");
    try {
      const res = await fetch("/api/dashboard/sender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, action: "verify-domain", domain: domainInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSenderConfig((prev) => ({ ...prev, senderDomain: data.senderDomain, senderDomainVerified: false }));
        setDnsRecords(data.dnsRecords || []);
        setSenderStatus("success");
        setSenderError("");
      } else {
        setSenderStatus("error");
        setSenderError(data.error || "Failed to configure domain");
      }
    } catch {
      setSenderStatus("error");
      setSenderError("Network error. Please try again.");
    }
  };

  const handleReset = async () => {
    setSenderStatus("loading");
    setSenderError("");
    try {
      const res = await fetch("/api/dashboard/sender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, action: "remove" }),
      });
      if (res.ok) {
        setSenderConfig({ senderEmail: null, senderVerified: false, senderDomain: null, senderDomainVerified: false });
        setEmailInput("");
        setDomainInput("");
        setDnsRecords([]);
        setSenderStatus("idle");
      } else {
        const data = await res.json().catch(() => ({}));
        setSenderStatus("error");
        setSenderError(data.error || "Failed to reset");
      }
    } catch {
      setSenderStatus("error");
      setSenderError("Network error. Please try again.");
    }
  };

  // Determine current from display
  const currentFrom = senderConfig.senderDomainVerified && senderConfig.senderDomain
    ? `hello@${senderConfig.senderDomain}`
    : senderConfig.senderVerified && senderConfig.senderEmail
      ? senderConfig.senderEmail
      : "hello@buildmy.directory";
  const isDefault = currentFrom === "hello@buildmy.directory";
  const hasCustomSender = !isDefault;

  return (
    <div className="bg-white border border-[color:var(--border)] rounded-xl p-5 space-y-6">
      {/* From name + reply-to */}
      <div>
        <h3 className="text-sm font-bold mb-1">Sender settings</h3>
        <p className="text-xs text-[color:var(--fg-subtle)] mb-4">
          Customise how your digest emails appear in subscribers&apos; inboxes.
        </p>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label htmlFor="from-name" className="text-xs font-semibold mb-1.5 block">
              From name
            </label>
            <input
              id="from-name"
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              maxLength={64}
              placeholder="e.g. Your Directory Weekly"
              className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
            />
            <p className="text-[11px] text-[color:var(--fg-subtle)] mt-1">
              Shown as &quot;<strong>{fromName || "Your site name"}</strong> &lt;{currentFrom}&gt;&quot;
            </p>
          </div>

          <div>
            <label htmlFor="reply-to" className="text-xs font-semibold mb-1.5 block">
              Reply-to email
            </label>
            <input
              id="reply-to"
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              maxLength={320}
              placeholder="you@yourdomain.com"
              className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
            />
            <p className="text-[11px] text-[color:var(--fg-subtle)] mt-1">
              Where replies to your digest emails go. Defaults to your account email if blank.
            </p>
          </div>

          {status === "error" && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-3 py-2">{error}</div>
          )}

          <button
            type="submit"
            disabled={status === "saving"}
            className="w-full h-10 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {status === "saving" ? "Saving..." : status === "saved" ? "Saved" : "Save settings"}
          </button>
        </form>
      </div>

      {/* Sender email verification */}
      <div className="border-t border-[color:var(--border)] pt-5">
        <h3 className="text-sm font-bold mb-1">From email address</h3>
        <p className="text-xs text-[color:var(--fg-subtle)] mb-3">
          Send subscriber emails from your own email or domain instead of hello@buildmy.directory.
        </p>

        {/* Current sender indicator */}
        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 bg-black/[0.03] rounded-lg">
          <div className={`w-2 h-2 rounded-full shrink-0 ${hasCustomSender ? "bg-green-500" : "bg-gray-300"}`} />
          <span className="text-xs font-medium truncate">{currentFrom}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
            hasCustomSender ? "bg-green-100 text-green-700" : "bg-black/5 text-[color:var(--fg-subtle)]"
          }`}>
            {hasCustomSender ? "Verified" : "Default"}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[color:var(--border)] mb-4">
          <button
            type="button"
            onClick={() => setActiveTab("email")}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition ${
              activeTab === "email"
                ? "border-[color:var(--fg)] text-[color:var(--fg)]"
                : "border-transparent text-[color:var(--fg-subtle)] hover:text-[color:var(--fg)]"
            }`}
          >
            Use my email
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("domain")}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition ${
              activeTab === "domain"
                ? "border-[color:var(--fg)] text-[color:var(--fg)]"
                : "border-transparent text-[color:var(--fg-subtle)] hover:text-[color:var(--fg)]"
            }`}
          >
            Use my domain
          </button>
        </div>

        {/* Email tab */}
        {activeTab === "email" && (
          <div className="space-y-3">
            <p className="text-[11px] text-[color:var(--fg-subtle)]">
              We&apos;ll send a verification email. Once confirmed, subscriber emails will come from your address.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                maxLength={320}
                placeholder="you@example.com"
                className="flex-1 h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
              />
              <button
                type="button"
                onClick={handleVerifyEmail}
                disabled={senderStatus === "loading" || !emailInput.trim()}
                className="h-10 px-4 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50 shrink-0"
              >
                {senderStatus === "loading" ? "Sending..." : "Verify"}
              </button>
            </div>

            {/* Pending verification indicator */}
            {senderConfig.senderEmail && !senderConfig.senderVerified && (
              <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
                <span className="text-xs text-yellow-800">
                  Verification pending for <strong>{senderConfig.senderEmail}</strong>. Check your inbox.
                </span>
              </div>
            )}

            {senderStatus === "success" && activeTab === "email" && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                <span className="text-xs text-green-800">
                  Verification email sent! Check your inbox and click the link.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Domain tab */}
        {activeTab === "domain" && (
          <div className="space-y-3">
            <p className="text-[11px] text-[color:var(--fg-subtle)]">
              Send emails from your own domain (e.g. hello@mail.yourdomain.com). Add the DNS records below.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                maxLength={255}
                placeholder="mail.yourdomain.com"
                className="flex-1 h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
              />
              <button
                type="button"
                onClick={handleVerifyDomain}
                disabled={senderStatus === "loading" || !domainInput.trim()}
                className="h-10 px-4 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50 shrink-0"
              >
                {senderStatus === "loading" ? "Checking..." : "Verify"}
              </button>
            </div>

            {/* DNS records */}
            {dnsRecords.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold">Required DNS records:</p>
                {dnsRecords.map((record, i) => (
                  <div key={i} className="bg-black/[0.03] rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold bg-black/10 px-1.5 py-0.5 rounded">{record.type}</span>
                      <span className="text-xs font-mono text-[color:var(--fg-subtle)] truncate">{record.name}</span>
                    </div>
                    <p className="text-xs font-mono break-all text-[color:var(--fg)]">{record.value}</p>
                    <p className="text-[10px] text-[color:var(--fg-subtle)]">{record.purpose}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Domain pending indicator */}
            {senderConfig.senderDomain && !senderConfig.senderDomainVerified && (
              <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
                <span className="text-xs text-yellow-800">
                  DNS verification pending for <strong>{senderConfig.senderDomain}</strong>. Add the records above, then click Verify.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Error display */}
        {senderStatus === "error" && senderError && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-3 py-2 mt-3">
            {senderError}
          </div>
        )}

        {/* Reset button */}
        {hasCustomSender && (
          <button
            type="button"
            onClick={handleReset}
            disabled={senderStatus === "loading"}
            className="mt-3 text-xs font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition"
          >
            Reset to default (hello@buildmy.directory)
          </button>
        )}
      </div>
    </div>
  );
}
