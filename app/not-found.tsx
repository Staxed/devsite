import Link from "next/link";
import Shell from "@/components/shell";

export default function NotFound() {
  return (
    <Shell>
      <main id="main-content" tabIndex={-1}>
        <section>
          <h1>Page Not Found</h1>
          <p className="subtitle">
            The page you are looking for does not exist or has been moved.
          </p>
          <div className="links">
            <Link href="/" className="btn btn-primary-gradient">
              &larr; Back to Home
            </Link>
          </div>
        </section>
      </main>
    </Shell>
  );
}
