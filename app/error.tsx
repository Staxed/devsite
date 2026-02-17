"use client";

import Shell from "@/components/shell";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Shell>
      <main id="main-content" tabIndex={-1}>
        <section>
          <h1>Something went wrong</h1>
          <p className="subtitle">
            An unexpected error occurred. Please try again.
          </p>
          <div className="links">
            <button
              onClick={reset}
              className="btn btn-primary-gradient"
            >
              Try again
            </button>
          </div>
        </section>
      </main>
    </Shell>
  );
}
