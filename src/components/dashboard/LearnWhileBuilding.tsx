"use client";

import { useState } from "react";

type Lesson = {
  id: string;
  title: string;
  description: string;
  steps: string[];
};

const LESSONS: Lesson[] = [
  {
    id: "posts",
    title: "Managing your posts",
    description: "Edit, hide, pin, or remove posts from your directory.",
    steps: [
      "Go to the Posts tab in your dashboard to see all your content.",
      "Click any post to edit its title, category, or caption.",
      "Use the eye icon to hide a post from your public directory without deleting it.",
      "Pin important posts so they always appear first for visitors.",
      "To delete a post permanently, click the trash icon on the post card.",
    ],
  },
  {
    id: "categories",
    title: "Organizing categories",
    description: "Add, rename, reorder, or remove the tabs visitors use to browse.",
    steps: [
      "Open the Categories tab to see all your content groups.",
      "Click \"Add category\" to create a new empty category you can assign posts to later.",
      "Click \"Rename\" on any category to change its label — all posts update instantly.",
      "Drag categories up or down to control the order they appear on your directory.",
      "Delete a category to move its posts to \"Uncategorized\" (nothing is lost).",
    ],
  },
  {
    id: "appearance",
    title: "Customizing your directory",
    description: "Change how your directory looks and feels to visitors.",
    steps: [
      "In your dashboard home, click your directory name or bio to edit them.",
      "Upload a new avatar or cover image to match your brand.",
      "Choose between a 2-column or 3-column grid for mobile visitors.",
      "Set an accent color that tints links and buttons on your public page.",
    ],
  },
  {
    id: "upload",
    title: "Manually adding content",
    description: "Add posts that aren't on Instagram or TikTok.",
    steps: [
      "Go to Posts → \"Add post\" to upload content directly.",
      "Add a thumbnail image so it looks great in the grid.",
      "Attach a video or pick a category — everything is optional except the title.",
      "Add references (links, YouTube videos) so visitors can dive deeper.",
    ],
  },
  {
    id: "sharing",
    title: "Sharing your directory",
    description: "Get your directory in front of your audience.",
    steps: [
      "Visit the Share tab for ready-made links, QR codes, and embed snippets.",
      "Add your directory link to your Instagram or TikTok bio.",
      "Share the link in your Stories — viewers can search all your content instantly.",
      "Connect a custom domain (Creator plan+) to make it truly yours.",
    ],
  },
];

export default function LearnWhileBuilding() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
  };

  const markDone = (id: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="max-w-sm mx-auto mt-10 w-full">
      <button
        type="button"
        onClick={() => setExpanded(expanded ? null : LESSONS[0].id)}
        className="mx-auto flex items-center gap-2 text-sm font-semibold text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition mb-4"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
        Learn how to manage your directory
      </button>

      {expanded !== null && (
        <div className="bg-white border border-[color:var(--border)] rounded-2xl overflow-hidden shadow-sm animate-fade-in">
          <div className="px-4 py-3 bg-gradient-to-r from-violet-50 to-purple-50 border-b border-[color:var(--border)]">
            <p className="text-xs font-bold text-purple-700">
              {completed.size} of {LESSONS.length} lessons reviewed
            </p>
            <div className="mt-1.5 h-1 bg-purple-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-600 rounded-full transition-all duration-300"
                style={{ width: `${(completed.size / LESSONS.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="divide-y divide-[color:var(--border)]">
            {LESSONS.map((lesson) => {
              const isOpen = expanded === lesson.id;
              const isDone = completed.has(lesson.id);
              return (
                <div key={lesson.id}>
                  <button
                    type="button"
                    onClick={() => toggle(lesson.id)}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-black/[0.02] transition"
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition ${
                        isDone
                          ? "bg-green-500 text-white"
                          : "border-2 border-[color:var(--border)] bg-white"
                      }`}
                    >
                      {isDone ? "✓" : ""}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${isDone ? "text-[color:var(--fg-subtle)] line-through" : ""}`}>
                        {lesson.title}
                      </p>
                      {!isOpen && (
                        <p className="text-[11px] text-[color:var(--fg-muted)] truncate">{lesson.description}</p>
                      )}
                    </div>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`shrink-0 text-[color:var(--fg-subtle)] transition-transform ${isOpen ? "rotate-90" : ""}`}
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 animate-fade-in">
                      <p className="text-xs text-[color:var(--fg-muted)] mb-3">{lesson.description}</p>
                      <ol className="space-y-2">
                        {lesson.steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <p className="text-xs text-[color:var(--fg)] leading-relaxed">{step}</p>
                          </li>
                        ))}
                      </ol>
                      <button
                        type="button"
                        onClick={() => markDone(lesson.id)}
                        className={`mt-3 text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                          isDone
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                        }`}
                      >
                        {isDone ? "Reviewed ✓" : "Mark as reviewed"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
