import type { Metadata } from "next";
import LegalLayout from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "The terms governing your use of BuildMy.Directory.",
};

export default function TermsPage() {
  return (
    <LegalLayout title="Terms & Conditions" lastUpdated="14 April 2026">
      <Section title="1. Agreement">
        <p>
          By accessing or using BuildMy.Directory (the &quot;Service&quot;), you agree to these
          Terms &amp; Conditions (the &quot;Terms&quot;). If you don&apos;t agree, please don&apos;t
          use the Service.
        </p>
      </Section>

      <Section title="2. The service">
        <p>
          BuildMy.Directory is a platform that lets creators build searchable directories from
          their social media content. We scrape public posts from the platforms you choose,
          transcribe videos, auto-categorize content, and publish it to a subdomain or custom
          domain you control.
        </p>
      </Section>

      <Section title="3. Accounts">
        <ul>
          <li>You must be at least 16 years old to create an account.</li>
          <li>You&apos;re responsible for maintaining the confidentiality of your credentials.</li>
          <li>You must provide accurate, current information when signing up.</li>
          <li>You&apos;re responsible for all activity under your account.</li>
          <li>We may suspend or terminate accounts that violate these Terms.</li>
        </ul>
      </Section>

      <Section title="4. Your content and rights">
        <p>
          You retain ownership of your social media content. By using the Service you grant us a
          worldwide, non-exclusive, royalty-free licence to scrape, cache, transcribe, categorize,
          and publish your content for the sole purpose of operating your directory. This licence
          ends when you delete your site or account.
        </p>
        <p>
          You represent that you have the right to display the content you choose to connect. If
          your content infringes third-party rights, you are solely responsible.
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>You may not use the Service to:</p>
        <ul>
          <li>Violate any law, third-party right, or platform terms (e.g. Instagram, TikTok).</li>
          <li>Scrape or republish content that is not yours without explicit permission.</li>
          <li>Upload or distribute hateful, harassing, defamatory, or sexually explicit content involving minors.</li>
          <li>Circumvent rate limits, scraping protections, or billing systems.</li>
          <li>Resell, white-label, or sub-license the Service without explicit written permission (unless on an Agency plan that includes white-label rights).</li>
          <li>Attempt to reverse-engineer, probe, or attack the Service.</li>
        </ul>
      </Section>

      <Section title="6. Subscriptions and payment">
        <ul>
          <li>Paid plans are billed monthly in advance via Stripe.</li>
          <li>
            Plan features, limits, and pricing are shown on our{" "}
            <a href="/#pricing" className="underline text-[color:var(--fg)]">pricing page</a> and may be updated with reasonable notice.
          </li>
          <li>You can cancel at any time — you&apos;ll retain access until the end of the current billing period.</li>
          <li>Refunds are generally not offered for partial months; contact us if you believe there are exceptional circumstances.</li>
          <li>Failed payments may result in your subscription being cancelled after a grace period. Your existing directory remains published but new builds and syncs will be paused until payment is restored.</li>
        </ul>
      </Section>

      <Section title="7. Domains">
        <p>
          Custom domains registered through our Service are registered via our registrar partner
          (Vercel Domains). The price shown at checkout includes registration and one year of
          management. Domain renewals are handled automatically where possible — if a renewal
          fails, we will notify you before the domain expires.
        </p>
      </Section>

      <Section title="8. Third-party content and links">
        <p>
          Your directory may display links to third-party content (posts on Instagram, TikTok,
          YouTube, and referenced articles). We are not responsible for the availability, accuracy,
          or content of those third-party sites.
        </p>
      </Section>

      <Section title="9. Service availability">
        <p>
          We aim for high availability but do not guarantee uninterrupted service. Scheduled
          maintenance, third-party infrastructure outages, and force majeure events may cause
          downtime. We&apos;re not liable for service interruptions.
        </p>
      </Section>

      <Section title="10. Intellectual property">
        <p>
          The Service — including our code, design, brand, documentation, and compilations of
          data — is owned by us and protected by copyright and other laws. You may not copy,
          modify, or redistribute our proprietary materials without written permission.
        </p>
      </Section>

      <Section title="11. Termination">
        <p>
          You may delete your account at any time from the dashboard. We may suspend or terminate
          your access for material breach of these Terms with reasonable notice (except in cases
          of abuse, fraud, or legal risk, where we may act immediately). Upon termination, we
          delete your data according to our{" "}
          <a href="/privacy" className="underline text-[color:var(--fg)]">Privacy Policy</a>.
        </p>
      </Section>

      <Section title="12. Disclaimer of warranties">
        <p>
          The Service is provided &quot;as is&quot; and &quot;as available&quot; without
          warranties of any kind, whether express or implied, including merchantability, fitness
          for a particular purpose, and non-infringement.
        </p>
      </Section>

      <Section title="13. Limitation of liability">
        <p>
          To the maximum extent permitted by law, our total liability to you for any claim arising
          out of these Terms or your use of the Service is limited to the amount you paid us in
          the 12 months preceding the claim. We are not liable for indirect, incidental, special,
          consequential, or punitive damages.
        </p>
      </Section>

      <Section title="14. Changes to these Terms">
        <p>
          We may update these Terms from time to time. Material changes will be communicated via
          email or a prominent in-app notice at least 14 days before they take effect.
        </p>
      </Section>

      <Section title="15. Governing law">
        <p>
          These Terms are governed by the laws of the jurisdiction where our company is registered.
          Any disputes will be resolved in the courts of that jurisdiction, unless a local consumer
          law gives you a non-waivable right to sue locally.
        </p>
      </Section>

      <Section title="16. Contact">
        <p>
          Questions about these Terms? Email{" "}
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
      <div className="space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_li]:leading-relaxed">
        {children}
      </div>
    </section>
  );
}
