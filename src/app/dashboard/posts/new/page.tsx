"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardNav from "@/components/dashboard/DashboardNav";
import { useSiteContext } from "@/components/dashboard/SiteContext";

type Reference = {
  kind: "article" | "youtube";
  title: string;
  url: string;
  note?: string;
};

/**
 * Manual post upload. Available on every plan. Submits the thumbnail,
 * optional media, and caption to /api/dashboard/posts as multipart
 * form-data. After the post is created we chain references to
 * /api/dashboard/posts/[postId]/references one at a time so a partial
 * failure doesn't orphan the post.
 */
export default function NewPostPage() {
  const router = useRouter();
  const { selectedSite, loading: sitesLoading } = useSiteContext();

  const [caption, setCaption] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [platformUrl, setPlatformUrl] = useState("");
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string>("");
  const [media, setMedia] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>("");
  const [refs, setRefs] = useState<Reference[]>([]);
  const [newRefTitle, setNewRefTitle] = useState("");
  const [newRefUrl, setNewRefUrl] = useState("");
  const [newRefKind, setNewRefKind] = useState<"article" | "youtube">("article");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");

  const thumbRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);

  const handleThumbChange = (file: File | null) => {
    setThumbnail(file);
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    setThumbnailPreview(file ? URL.createObjectURL(file) : "");
  };
  const handleMediaChange = (file: File | null) => {
    setMedia(file);
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaPreview(file ? URL.createObjectURL(file) : "");
  };

  const addRef = () => {
    if (!newRefTitle.trim() || !newRefUrl.trim()) return;
    setRefs((arr) => [
      ...arr,
      { kind: newRefKind, title: newRefTitle.trim(), url: newRefUrl.trim() },
    ]);
    setNewRefTitle("");
    setNewRefUrl("");
  };
  const removeRef = (idx: number) => setRefs((arr) => arr.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedSite) { setError("No site selected."); return; }
    if (!thumbnail) { setError("Thumbnail is required."); return; }
    if (!caption.trim()) { setError("Caption is required."); return; }

    setSubmitting(true);
    setProgress("Uploading post…");

    try {
      const fd = new FormData();
      fd.append("siteId", selectedSite.id);
      fd.append("caption", caption.trim());
      if (title.trim()) fd.append("title", title.trim());
      if (category.trim()) fd.append("category", category.trim());
      if (platformUrl.trim()) fd.append("platformUrl", platformUrl.trim());
      fd.append("thumbnail", thumbnail);
      if (media) fd.append("media", media);
      if (media?.type.startsWith("video/")) fd.append("type", "video");
      else fd.append("type", "image");

      const res = await fetch("/api/dashboard/posts", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        setSubmitting(false);
        return;
      }
      const postId = data.post?.id;
      if (!postId) {
        setError("Post created but no id returned.");
        setSubmitting(false);
        return;
      }

      if (refs.length) {
        setProgress(`Adding references (0/${refs.length})…`);
        for (let i = 0; i < refs.length; i++) {
          const r = refs[i];
          await fetch(`/api/dashboard/posts/${postId}/references`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: r.kind,
              title: r.title,
              url: r.url,
              note: r.note || null,
            }),
          });
          setProgress(`Adding references (${i + 1}/${refs.length})…`);
        }
      }

      router.push("/dashboard/posts");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[color:var(--bg)]">
      <DashboardNav />
      <div className="max-w-3xl mx-auto px-4 sm:px-10 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight mb-1">New post</h1>
            <p className="text-sm text-[color:var(--fg-muted)]">
              Upload your own thumbnail, media, caption and references. No scraping.
            </p>
          </div>
          <Link
            href="/dashboard/posts"
            className="h-9 px-3 text-xs font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] flex items-center"
          >
            ← Back
          </Link>
        </div>

        {sitesLoading ? (
          <div className="text-sm text-[color:var(--fg-muted)]">Loading…</div>
        ) : !selectedSite ? (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-xl px-4 py-3">
            You don&apos;t have any directories yet. <Link href="/onboarding" className="font-semibold underline">Create one first</Link>.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Thumbnail */}
            <Section label="Thumbnail" required>
              <div className="flex items-start gap-4">
                <div className="w-32 aspect-[4/5] bg-black/5 rounded-xl overflow-hidden flex items-center justify-center shrink-0">
                  {thumbnailPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnailPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-[color:var(--fg-subtle)] font-semibold">No preview</span>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    ref={thumbRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleThumbChange(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => thumbRef.current?.click()}
                    className="h-10 px-4 bg-black/5 hover:bg-black/10 rounded-lg text-sm font-semibold transition"
                  >
                    {thumbnail ? "Replace thumbnail" : "Choose thumbnail"}
                  </button>
                  {thumbnail && (
                    <p className="text-xs text-[color:var(--fg-subtle)] mt-2">
                      {thumbnail.name} · {(thumbnail.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  )}
                  <p className="text-xs text-[color:var(--fg-subtle)] mt-2">
                    PNG or JPEG, max 5 MB. Recommended aspect ratio 4:5.
                  </p>
                </div>
              </div>
            </Section>

            {/* Media */}
            <Section label="Media" hint="Optional — video or image to play when the tile is opened">
              <div className="flex items-start gap-4">
                <div className="w-32 aspect-[4/5] bg-black/5 rounded-xl overflow-hidden flex items-center justify-center shrink-0">
                  {mediaPreview && media?.type.startsWith("video/") ? (
                    <video src={mediaPreview} className="w-full h-full object-cover" muted />
                  ) : mediaPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-[color:var(--fg-subtle)] font-semibold">No media</span>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    ref={mediaRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={(e) => handleMediaChange(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => mediaRef.current?.click()}
                    className="h-10 px-4 bg-black/5 hover:bg-black/10 rounded-lg text-sm font-semibold transition"
                  >
                    {media ? "Replace media" : "Choose media"}
                  </button>
                  {media && (
                    <p className="text-xs text-[color:var(--fg-subtle)] mt-2">
                      {media.name} · {(media.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  )}
                  <p className="text-xs text-[color:var(--fg-subtle)] mt-2">
                    Video (mp4/webm) or image, max 100 MB.
                  </p>
                </div>
              </div>
            </Section>

            {/* Caption */}
            <Section label="Caption" required>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                maxLength={5000}
                placeholder="Write the caption that appears under the post…"
                className="w-full px-4 py-3 bg-white border-2 border-[color:var(--border)] rounded-xl text-sm focus:outline-none focus:border-[color:var(--fg)] transition resize-y"
              />
              <p className="text-[10px] text-[color:var(--fg-subtle)] mt-1 text-right">
                {caption.length}/5000
              </p>
            </Section>

            {/* Title + category side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Section label="Title" hint="Defaults to the first line of the caption">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder="Optional"
                  className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
                />
              </Section>
              <Section label="Category" hint="Defaults to 'Uncategorized'">
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  maxLength={64}
                  placeholder="e.g. Business strategy"
                  className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
                />
              </Section>
            </div>

            {/* Platform URL */}
            <Section label="Source URL" hint="Optional — link back to the original post on Instagram, TikTok, etc.">
              <input
                type="url"
                value={platformUrl}
                onChange={(e) => setPlatformUrl(e.target.value)}
                placeholder="https://instagram.com/p/…"
                className="w-full h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
              />
            </Section>

            {/* References */}
            <Section label="References" hint="Optional — articles and YouTube videos related to this post">
              <div className="space-y-2 mb-3">
                {refs.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 bg-black/5 rounded-lg px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--fg-subtle)]">
                      {r.kind}
                    </span>
                    <span className="flex-1 min-w-0 text-sm truncate">{r.title}</span>
                    <span className="text-xs text-[color:var(--fg-subtle)] truncate max-w-[160px]">
                      {r.url}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeRef(i)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      remove
                    </button>
                  </div>
                ))}
                {refs.length === 0 && (
                  <p className="text-xs text-[color:var(--fg-subtle)]">No references added yet.</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr_1.3fr_auto] gap-2">
                <select
                  value={newRefKind}
                  onChange={(e) => setNewRefKind(e.target.value as "article" | "youtube")}
                  className="h-10 px-2 bg-white border-2 border-[color:var(--border)] rounded-lg text-xs font-semibold"
                >
                  <option value="article">Article</option>
                  <option value="youtube">YouTube</option>
                </select>
                <input
                  type="text"
                  value={newRefTitle}
                  onChange={(e) => setNewRefTitle(e.target.value)}
                  placeholder="Title"
                  className="h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
                />
                <input
                  type="url"
                  value={newRefUrl}
                  onChange={(e) => setNewRefUrl(e.target.value)}
                  placeholder="URL"
                  className="h-10 px-3 bg-white border-2 border-[color:var(--border)] rounded-lg text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
                />
                <button
                  type="button"
                  onClick={addRef}
                  disabled={!newRefTitle.trim() || !newRefUrl.trim()}
                  className="h-10 px-4 bg-black/5 hover:bg-black/10 disabled:opacity-40 rounded-lg text-sm font-semibold transition"
                >
                  Add
                </button>
              </div>
            </Section>

            {/* Submit */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 justify-end">
              {progress && (
                <span className="text-xs text-[color:var(--fg-subtle)]">{progress}</span>
              )}
              <Link
                href="/dashboard/posts"
                className="h-11 px-5 border-2 border-[color:var(--border)] rounded-xl text-sm font-semibold hover:bg-black/5 transition flex items-center"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="h-11 px-5 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
              >
                {submitting ? "Publishing…" : "Publish post"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function Section({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-xs font-semibold uppercase tracking-wider">
          {label}
          {required && <span className="text-red-600 ml-1">*</span>}
        </label>
        {hint && <span className="text-[10px] text-[color:var(--fg-subtle)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
