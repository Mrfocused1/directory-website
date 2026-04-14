import type { Metadata } from "next";
import LegalLayout from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How BuildMy.Directory collects, uses, and protects your personal data.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="14 April 2026">
      <Section title="1. Who we are">
        <p>
          BuildMy.Directory (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the website at{" "}
          <a href="https://buildmy.directory" className="underline text-[color:var(--fg)]">
            buildmy.directory
          </a>{" "}
          and provides a platform for creators to turn their social media content into searchable
          directories. This Privacy Policy explains how we collect, use, and share information about
          you when you use our service.
        </p>
      </Section>

      <Section title="2. Information we collect">
        <p>We collect the following categories of information:</p>
        <ul>
          <li>
            <strong>Account data:</strong> email address, name, password (hashed), and your chosen
            plan. Collected when you sign up.
          </li>
          <li>
            <strong>Content data:</strong> the social media handles you provide, and the posts,
            captions, transcripts, and media we scrape and process on your behalf.
          </li>
          <li>
            <strong>Payment data:</strong> handled entirely by Stripe. We never see or store your
            card details — only a customer ID Stripe provides us.
          </li>
          <li>
            <strong>Visitor analytics:</strong> when someone visits a directory, we log the page
            viewed, session ID, referrer, device type, browser, and approximate country (from
            IP, but we don&apos;t store the IP itself).
          </li>
          <li>
            <strong>Subscriber data:</strong> if a visitor subscribes to your directory&apos;s
            newsletter, we store their email and category preferences.
          </li>
        </ul>
      </Section>

      <Section title="3. How we use your information">
        <ul>
          <li>To operate the service — scraping, transcribing, categorizing, and publishing your directory.</li>
          <li>To authenticate you and secure your account.</li>
          <li>To process payments and manage subscriptions via Stripe.</li>
          <li>To send transactional emails (verification, digests, account notifications).</li>
          <li>To provide you with analytics about your directory&apos;s performance.</li>
          <li>To improve the service and develop new features.</li>
        </ul>
      </Section>

      <Section title="4. Third-party services">
        <p>
          We rely on a small number of trusted third-party services. Each has their own privacy
          policy and only receives the data necessary to perform its function:
        </p>
        <ul>
          <li><strong>Supabase</strong> — authentication (email, password hash)</li>
          <li><strong>Neon / Supabase Postgres</strong> — primary database hosting</li>
          <li><strong>Vercel</strong> — hosting, Edge network, and Blob storage for media</li>
          <li><strong>Stripe</strong> — payment processing</li>
          <li><strong>Resend</strong> — transactional email delivery</li>
          <li><strong>Apify</strong> — scraping Instagram and TikTok profiles</li>
          <li><strong>Deepgram</strong> — video transcription</li>
          <li><strong>Anthropic (Claude)</strong> — AI-powered content categorization</li>
          <li><strong>Inngest</strong> — background job orchestration</li>
        </ul>
      </Section>

      <Section title="5. Cookies and session storage">
        <p>
          We use strictly necessary cookies for authentication (Supabase sessions) and to prevent
          spam. We also use <code>sessionStorage</code> for analytics (generating a temporary
          session ID that resets when you close the tab). We do not use third-party advertising
          cookies or cross-site trackers.
        </p>
      </Section>

      <Section title="6. Data retention">
        <p>
          Account and content data are retained for as long as your account is active. Analytics
          data is retained for up to 24 months. If you delete your account, we permanently delete
          your sites, posts, subscribers, and personal data within 30 days (except where we&apos;re
          legally required to retain certain records — e.g. payment/tax records up to 7 years).
        </p>
      </Section>

      <Section title="7. Your rights">
        <p>
          Depending on your location, you may have the right to: access the personal data we hold
          about you; correct inaccurate data; delete your data; restrict or object to processing;
          and request data portability. You can exercise most of these rights directly from your
          account settings, or by emailing us at{" "}
          <a href="mailto:hello@buildmy.directory" className="underline text-[color:var(--fg)]">
            hello@buildmy.directory
          </a>
          .
        </p>
      </Section>

      <Section title="8. International transfers">
        <p>
          Our primary services are hosted in the European Union (Supabase in Ireland, Vercel Edge
          globally). Some third-party services (Apify, Deepgram, Anthropic, Stripe) may process
          data in the United States. We rely on Standard Contractual Clauses and each provider&apos;s
          compliance framework to protect transferred data.
        </p>
      </Section>

      <Section title="9. Children">
        <p>
          The service is not directed at children under 16. We do not knowingly collect data from
          children. If you believe a child has provided us information, please contact us and
          we&apos;ll delete it.
        </p>
      </Section>

      <Section title="10. Changes to this policy">
        <p>
          We may update this policy from time to time. Material changes will be communicated via
          email or a prominent notice on the site. The &quot;last updated&quot; date at the top of
          this page always reflects the current version.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          Questions about this policy? Email{" "}
          <a href="mailto:hello@buildmy.directory" className="underline text-[color:var(--fg)]">
            hello@buildmy.directory
          </a>
          .
        </p>
      </Section>
    </LegalLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold text-[color:var(--fg)] mb-3">{title}</h2>
      <div className="space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_li]:leading-relaxed [&_code]:bg-black/5 [&_code]:px-1 [&_code]:rounded">
        {children}
      </div>
    </section>
  );
}
