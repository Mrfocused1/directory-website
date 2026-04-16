"use client";

import { useState } from "react";

/**
 * Admin-only button that permanently deletes a user account + all
 * their sites/posts so the email can re-register fresh. Prompts
 * twice before executing (confirm → type email to confirm).
 */
export default function RevokeButton({ email }: { email: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleRevoke = async () => {
    const first = confirm(
      `Permanently revoke ${email}?\n\nThis deletes their account, all sites, posts, subscribers, and analytics. The email becomes free to sign up again.\n\nThis CANNOT be undone.`,
    );
    if (!first) return;

    const typed = prompt(`Type the email to confirm: ${email}`);
    if (typed?.trim().toLowerCase() !== email.toLowerCase()) {
      alert("Email didn't match. Revoke cancelled.");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/users/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(`✓ Revoked. ${data.message}`);
      } else {
        setResult(`✗ ${data.error}`);
      }
    } catch {
      setResult("✗ Network error");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <span className="text-xs text-[color:var(--fg-muted)]">{result}</span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleRevoke}
      disabled={loading}
      className="text-xs font-semibold text-red-600 hover:text-red-800 hover:underline disabled:opacity-50"
    >
      {loading ? "Revoking…" : "Revoke"}
    </button>
  );
}
