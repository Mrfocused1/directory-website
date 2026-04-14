"use client";

import { useState } from "react";

type Status = "idle" | "sending" | "success" | "error";

const TOPICS = [
  { value: "general", label: "General inquiry" },
  { value: "sales", label: "Sales" },
  { value: "support", label: "Support" },
  { value: "feedback", label: "Feedback" },
  { value: "press", label: "Press" },
];

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("general");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setErrorMessage("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, topic, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus("success");
        setName("");
        setEmail("");
        setTopic("general");
        setMessage("");
      } else {
        setStatus("error");
        setErrorMessage(data?.error || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please try again.");
    }
  };

  return (
    <section id="contact" className="pb-24 px-6 max-w-3xl mx-auto scroll-mt-16">
      <div className="text-center mb-10">
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">Get in touch</h2>
        <p className="text-[color:var(--fg-muted)] max-w-xl mx-auto">
          Questions, feedback, partnerships — drop us a line and we&apos;ll reply within one business day.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="bg-white border border-[color:var(--border)] rounded-2xl p-6 sm:p-8 shadow-sm"
      >
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="contact-name" className="text-sm font-semibold mb-1.5 block">
              Name
            </label>
            <input
              id="contact-name"
              type="text"
              required
              maxLength={128}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Your name"
              className="w-full h-11 px-3.5 bg-white border-2 border-[color:var(--border)] rounded-xl text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
            />
          </div>
          <div>
            <label htmlFor="contact-email" className="text-sm font-semibold mb-1.5 block">
              Email
            </label>
            <input
              id="contact-email"
              type="email"
              required
              maxLength={320}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full h-11 px-3.5 bg-white border-2 border-[color:var(--border)] rounded-xl text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
            />
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="contact-topic" className="text-sm font-semibold mb-1.5 block">
            Topic
          </label>
          <select
            id="contact-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full h-11 px-3.5 bg-white border-2 border-[color:var(--border)] rounded-xl text-sm focus:outline-none focus:border-[color:var(--fg)] transition"
          >
            {TOPICS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label htmlFor="contact-message" className="text-sm font-semibold mb-1.5 block">
            Message
          </label>
          <textarea
            id="contact-message"
            required
            maxLength={5000}
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what's on your mind..."
            className="w-full px-3.5 py-3 bg-white border-2 border-[color:var(--border)] rounded-xl text-sm focus:outline-none focus:border-[color:var(--fg)] transition resize-y"
          />
          <p className="text-xs text-[color:var(--fg-subtle)] mt-1 tabular-nums">
            {message.length} / 5000
          </p>
        </div>

        {status === "error" && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl px-4 py-3">
            {errorMessage}
          </div>
        )}
        {status === "success" && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-4 py-3">
            Thanks — your message is on its way. We&apos;ll reply to your email shortly.
          </div>
        )}

        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full h-12 bg-[color:var(--fg)] text-[color:var(--bg)] rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
        >
          {status === "sending" ? "Sending..." : "Send message"}
        </button>

        <p className="text-xs text-[color:var(--fg-subtle)] text-center mt-4">
          You can also email us directly at{" "}
          <a
            href="mailto:hello@buildmy.directory"
            className="font-semibold text-[color:var(--fg)] hover:underline"
          >
            hello@buildmy.directory
          </a>
          .
        </p>
      </form>
    </section>
  );
}
