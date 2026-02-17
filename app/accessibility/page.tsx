import type { Metadata } from "next";
import Link from "next/link";
import Shell from "@/components/shell";

export const metadata: Metadata = {
  title: "Accessibility Statement",
  description: "Accessibility Statement for Staxed.dev",
};

export default function AccessibilityPage() {
  return (
    <Shell>
      <main id="main-content">
        <section>
          <h1>Accessibility Statement</h1>

          <p className="subtitle">
            <strong>Last updated:</strong> November 14, 2025
          </p>

          <div className="legal-content">
            <h2>Our Commitment</h2>
            <p>
              Staxed.dev is committed to ensuring digital accessibility for
              people with disabilities. We are continually improving the user
              experience for everyone and applying relevant accessibility
              standards.
            </p>

            <h2>Conformance Status</h2>
            <p>
              This website aims to conform with the{" "}
              <strong>
                Web Content Accessibility Guidelines (WCAG) 2.2 Level AA
              </strong>{" "}
              standards. WCAG defines requirements for designers and developers
              to improve accessibility for people with disabilities.
            </p>

            <h2>Accessibility Features</h2>
            <p>
              We have implemented the following accessibility features:
            </p>
            <ul>
              <li>Semantic HTML5 markup for proper document structure</li>
              <li>ARIA labels and landmarks for screen reader support</li>
              <li>
                Keyboard navigation support with visible focus indicators
              </li>
              <li>
                Sufficient color contrast ratios (WCAG 2.2 AA compliant)
              </li>
              <li>Responsive design that works on all screen sizes</li>
              <li>Alt text for all images</li>
              <li>Skip to main content link for keyboard users</li>
              <li>
                Minimum target sizes of 24&times;24px for interactive elements
              </li>
              <li>Support for reduced motion preferences</li>
            </ul>

            <h2>Known Limitations</h2>
            <p>
              While we strive to ensure accessibility, there may be some
              limitations. If you encounter any accessibility barriers, please
              contact us through the social links on the main page.
            </p>

            <h2>Feedback</h2>
            <p>
              We welcome your feedback on the accessibility of Staxed.dev. If
              you encounter accessibility barriers, please contact us through:
            </p>
            <ul>
              <li>
                <a
                  href="https://github.com/Staxed/devsite/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Create a Github Issue
                </a>
              </li>
              <li>
                X (Twitter):{" "}
                <a
                  href="https://x.com/StaxedAF"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @StaxedAF
                </a>
              </li>
              <li>
                Email:{" "}
                <a href="mailto:staxed@aeonforge.io">staxed@aeonforge.io</a>
              </li>
            </ul>

            <h2>Assessment Methods</h2>
            <p>We assess accessibility through:</p>
            <ul>
              <li>Automated testing tools (Lighthouse, WAVE)</li>
              <li>Manual keyboard navigation testing</li>
              <li>Screen reader testing</li>
              <li>WCAG 2.2 AA compliance verification</li>
            </ul>

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
