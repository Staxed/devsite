import type { Metadata } from "next";
import Link from "next/link";
import Shell from "@/components/shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for Staxed.dev",
};

export default function PrivacyPage() {
  return (
    <Shell>
      <main id="main-content" tabIndex={-1}>
        <section>
          <h1>Privacy Policy</h1>

          <p className="subtitle">
            <strong>Last updated:</strong> November 14, 2025
          </p>

          <div className="legal-content">
            <h2>Overview</h2>
            <p>
              This Privacy Policy describes how Staxed.dev (&ldquo;we&rdquo;,
              &ldquo;our&rdquo;, or &ldquo;us&rdquo;) handles information when
              you visit our website.
            </p>

            <h2>Information We Collect</h2>
            <p>
              <strong>We do not collect any personal information.</strong> This
              website is a static site that does not use:
            </p>
            <ul>
              <li>Cookies or tracking technologies</li>
              <li>Analytics services</li>
              <li>Contact forms</li>
              <li>User accounts or registration</li>
              <li>Third-party data collection services</li>
            </ul>

            <h2>Server Logs</h2>
            <p>
              Our web hosting provider may collect standard server logs including
              IP addresses, browser type, and access times. This information is
              used for technical purposes (security, troubleshooting) and is not
              used to identify individual visitors.
            </p>

            <h2>External Links</h2>
            <p>
              This website contains links to external sites (GitHub, X/Twitter).
              We are not responsible for the privacy practices of these external
              sites. Please review their privacy policies.
            </p>

            <h2>Your Rights</h2>
            <p>
              Since we do not collect personal data, there is no personal data to
              access, modify, or delete. If you have questions about this policy,
              you can contact us through the social links on the main page.
            </p>

            <h2>Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. The
              &ldquo;Last updated&rdquo; date at the top indicates when changes
              were made.
            </p>

            <div className="back-link-container">
              <Link href="/" className="btn btn-primary-gradient">
                &larr; Back to Home
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Shell>
  );
}
