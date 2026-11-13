"use client";

import BackfillPanel from "@/components/admin/backfill-panel";

export default function BackfillPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <h2 className="admin-section-title">GitHub Backfill</h2>
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
        Discover repositories and import historical commits and PRs. The Include ticks are shared with Settings → Discord repos, and Backfill Included skips repos already backfilled. This is safe to re-run — duplicates are automatically skipped.
      </p>
      <BackfillPanel />
    </main>
  );
}
