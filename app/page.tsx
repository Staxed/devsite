import Shell from "@/components/shell";
import Tag from "@/components/tag";
import Avatar from "@/components/avatar";
import Footer from "@/components/footer";

export default function Home() {
  return (
    <Shell>
      <main id="main-content" tabIndex={-1}>
        <section>
          <Tag />

          <h1>
            <span className="gradient-text">Staxed</span> - dragons, dev, and
            experiments in one crazy brain
          </h1>

          <p className="subtitle">
            I am a Creator blending AI, blockchain, and art to build tools,
            dragons, and digital worlds 🐉 | Focused on automation, design,
            imagination ... and whatever else I&apos;m breaking this week. A
            fuller site is coming soon; for now, start here.
          </p>

          <div className="links">
            <a
              className="btn btn-primary-gradient"
              href="https://github.com/Staxed"
              target="_blank"
              rel="noopener noreferrer"
            >
              Projects &amp; Repos
              <span className="sr-only"> (opens in new tab)</span>
            </a>
            <a
              className="btn btn-x"
              href="https://x.com/StaxedAF"
              target="_blank"
              rel="noopener noreferrer"
            >
              Connect on X
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          </div>

          <Footer />
        </section>
      </main>

      <Avatar />
    </Shell>
  );
}
