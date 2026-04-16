import type { Metadata } from "next";
import LegalLayout from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How BuildMy.Directory collects, uses, and protects your personal data.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="16 April 2026">
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
            viewed, session ID, referrer, device type, browser, user-agent string, and approximate
            country (from IP, but we don&apos;t store the IP itself).
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
          <li><strong>Authentication partner</strong> — stores your email and a hash of your password</li>
          <li><strong>Database partner</strong> — primary database hosting for all account + content data</li>
          <li><strong>Hosting partner</strong> — hosts the website, serves the Edge network, and stores media</li>
          <li><strong>Payment processor</strong> — handles card details and subscriptions (we never see card numbers)</li>
          <li><strong>Email delivery partner</strong> — sends confirmation, reset, and newsletter emails</li>
          <li><strong>Content-scraping partner</strong> — pulls your posts from your linked social profiles</li>
          <li><strong>Transcription partner</strong> — turns your video audio into searchable text</li>
          <li><strong>AI categorization partner</strong> — detects topics and labels each post</li>
          <li><strong>Background-job partner</strong> — orchestrates the long-running build and sync pipelines</li>
          <li><strong>PostHog</strong> — product analytics and feature flags (EU-hosted)</li>
          <li><strong>Sentry</strong> — error tracking and performance monitoring</li>
        </ul>
        <p>
          A current list of the specific vendors we use is available on request at{" "}
          <a href="mailto:hello@buildmy.directory" className="underline text-[color:var(--fg)]">
            hello@buildmy.directory
          </a>
          .
        </p>
      </Section>

      <Section title="5. Cookies and session storage">
        <p>
          We use strictly necessary cookies for authentication and to prevent spam. We also use{" "}
          <code>sessionStorage</code> for analytics (generating a temporary session ID that resets
          when you close the tab). We do not use third-party advertising cookies or cross-site
          trackers.
        </p>
        <p>
          When you first visit the site, analytics tracking is disabled. A cookie consent banner
          lets you choose whether to allow analytics cookies. If you accept, PostHog will begin
          collecting analytics data. If you decline (or ignore the banner), no analytics data is
          collected. You can change your preference at any time by clearing your browser&apos;s
          local storage and reloading the page.
        </p>
      </Section>

      <Section title="6. Data retention">
        <p>
          Account and content data are retained for as long as your account is active. Analytics
          data is retained for up to 90 days. If you delete your account, we permanently delete
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
          Our primary services are hosted in the European Union. Some of our infrastructure
          partners may process data in the United States. We rely on Standard Contractual Clauses
          and each provider&apos;s compliance framework to protect transferred data.
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
