"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardNav from "@/components/dashboard/DashboardNav";
import { createClient } from "@/lib/supabase/client";

type Account = {
  id: string;
  email: string;
  name: string | null;
  plan: "free" | "creator" | "pro" | "agency";
  hasBilling: boolean;
  createdAt: string;
};

const PLAN_NAMES = {
  free: "Free",
  creator: "Creator",
  pro: "Pro",
  agency: "Agency",
} as const;

export default function AccountPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileStatus, setProfileStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [profileError, setProfileError] = useState("");

  // Password form
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [passwordError, setPasswordError] = useState("");

  // Delete
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState("");

  // Portal
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/dashboard/account");
        const data = await res.json();
        if (res.ok) {
          setAccount(data.account);
          setName(data.account.name || "");
          setEmail(data.account.email);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (profileStatus === "saving") return;
    setProfileStatus("saving");
    setProfileError("");

    const body: Record<string, string> = {};
    if (account && (name || "") !== (account.name || "")) body.name = name;
    if (account && email !== account.email) body.email = email;
    if (Object.keys(body).length === 0) {
      setProfileStatus("idle");
      return;
    }

    try {
      const res = await fetch("/api/dashboard/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setProfileStatus("saved");
        setTimeout(() => setProfileStatus("idle"), 2000);
        if (account && body.email) {
          // Email change needs confirmation — show a hint
          setProfileError("Check your new email inbox to confirm the change.");
        }
        if (body.name != null) {
          setAccount((a) => (a ? { ...a, name: body.name || null } : a));
        }
      } else {
        setProfileStatus("error");
        setProfileError(data?.error || "Failed to save.");
      }
    } catch {
      setProfileStatus("error");
      setProfileError("Network error.");
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (passwordStatus === "saving") return;
    setPasswordStatus("saving");
    setPasswordError("");
    if (newPassword.length < 6) {
      setPasswordStatus("error");
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordStatus("error");
        setPasswordError(error.message);
      } else {
        setPasswordStatus("saved");
        setNewPassword("");
        setTimeout(() => setPasswordStatus("idle"), 2000);
      }
    } catch {
      setPasswordStatus("error");
      setPasswordError("Something went wrong.");
    }
  }

  async function openPortal() {
    if (portalLoading) return;
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Portal unavailable.");
    } catch {
      alert("Network error.");
    } finally {
      setPortalLoading(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirm !== "DELETE") {
      setDeleteError('Type "DELETE" exactly to confirm.');
      return;
    }
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/dashboard/account", { method: "DELETE" });
      if (res.ok) {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data?.error || "Failed to delete account.");
        setDeleting(false);
      }
    } catch {
      setDeleteError("Network error.");
      setDeleting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[color:var(--bg)]">
      <DashboardNav />
      <div className="max-w-2xl mx-auto px-4 sm:px-10 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight mb-1">Account</h1>
          <p className="text-sm text-[color:var(--fg-muted)]">
            Manage your profile, password, billing, and account.
          </p>
        </div>

        {loading ? (
          <div className="text-sm text-[color:var(--fg-subtle)]">Loading...</div>
        ) : !account ? (
          <div className="text-sm text-red-600">Failed to load account.</div>
        ) : (
          <div className="space-y-5">
            {/* Plan card */}
            <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold">Current plan</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-black/5 px-2 py-0.5 rounded">
                  {PLAN_NAMES[account.plan]}
                </span>
              </div>
              <p className="text-xs text-[color:var(--fg-subtle)] mb-4">
                {account.hasBilling
                  ? "Manage your subscription, update payment method, download invoices, or cancel."
                  : "You’re on the Free plan. Upgrade from the homepage to unlock more features."}
              </p>
              {account.hasBilling && (
                <button
                  type="button"
                  onClick={openPortal}
                  disabled={portalLoading}
                  className="h-10 px-4 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50"
                >
                  {portalLoading ? "Opening..." : "Open billing portal"}
                </button>
              )}
            </div>

            {/* Profile form */}
            <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
              <h2 className="text-sm font-bold mb-1">Profile</h2>
              <p className="text-xs text-[color:var(--fg-subtle)] mb-4">
                Changing your email will send a confirmation link to the new address.
              </p>
              <form onSubmit={saveProfile} className="space-y-4">
                <div>
                  <label htmlFor="acc-name" className="text-xs font-semibold mb-1.5 block">
                    Display name
                  </label>
                  <input
                    id="acc-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={64}
                    className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
                  />
                </div>
                <div>
                  <label htmlFor="acc-email" className="text-xs font-semibold mb-1.5 block">
                    Email
                  </label>
                  <input
                    id="acc-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
                  />
                </div>
                {profileError && (
                  <div
                    className={`text-xs rounded-lg px-3 py-2 ${
                      profileStatus === "error"
                        ? "bg-red-50 border border-red-200 text-red-800"
                        : "bg-blue-50 border border-blue-200 text-blue-800"
                    }`}
                  >
                    {profileError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={profileStatus === "saving"}
                  className="h-10 px-4 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50"
                >
                  {profileStatus === "saving"
                    ? "Saving..."
                    : profileStatus === "saved"
                      ? "Saved ✓"
                      : "Save profile"}
                </button>
              </form>
            </div>

            {/* Password */}
            <div className="bg-white border border-[color:var(--border)] rounded-xl p-5">
              <h2 className="text-sm font-bold mb-1">Change password</h2>
              <p className="text-xs text-[color:var(--fg-subtle)] mb-4">
                Make it at least 6 characters. You won&apos;t be signed out of other devices.
              </p>
              <form onSubmit={changePassword} className="space-y-4">
                <div>
                  <label htmlFor="acc-pw" className="text-xs font-semibold mb-1.5 block">
                    New password
                  </label>
                  <input
                    id="acc-pw"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
                  />
                </div>
                {passwordError && (
                  <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-3 py-2">
                    {passwordError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={passwordStatus === "saving" || !newPassword}
                  className="h-10 px-4 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50"
                >
                  {passwordStatus === "saving"
                    ? "Updating..."
                    : passwordStatus === "saved"
                      ? "Updated ✓"
                      : "Update password"}
                </button>
              </form>
            </div>

            {/* Danger zone */}
            <div className="bg-white border-2 border-red-200 rounded-xl p-5">
              <h2 className="text-sm font-bold text-red-700 mb-1">Delete account</h2>
              <p className="text-xs text-red-700/80 mb-4">
                This permanently deletes your account, all sites, posts, subscribers, and billing.
                This cannot be undone.
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder='Type "DELETE" to confirm'
                  className="w-full h-10 px-3 bg-white border-2 border-red-200 rounded-lg text-sm focus:outline-none focus:border-red-500 transition"
                />
                {deleteError && (
                  <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-3 py-2">
                    {deleteError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={deleteAccount}
                  disabled={deleting || deleteConfirm !== "DELETE"}
                  className="h-10 px-4 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Delete my account"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
