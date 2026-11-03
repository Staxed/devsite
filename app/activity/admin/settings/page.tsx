"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [excludedRepos, setExcludedRepos] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      const row = (data.settings || []).find((s: { key: string }) => s.key === "excluded_repos");
      setExcludedRepos(row?.value ?? "");
      setLoading(false);
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "excluded_repos", value: excludedRepos }),
    });
    setStatus(res.ok ? "Saved." : `Save failed: ${(await res.json()).error}`);
  }

  if (loading) return <p className="timeline-empty">Loading...</p>;

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="admin-section">
        <h2 className="admin-section-title">Settings</h2>
        <form onSubmit={handleSubmit} className="admin-form">
          <label htmlFor="excluded-repos" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}>
            Excluded repos
          </label>
          <p className="admin-list-item-meta">
            Comma-separated owner/repo patterns; * and ? are wildcards. Their activity still counts in every
            number but shows only as a combined &ldquo;redacted repos&rdquo; line.
          </p>
          <input
            id="excluded-repos"
            type="text"
            value={excludedRepos}
            onChange={(e) => setExcludedRepos(e.target.value)}
            placeholder="AeonForge-io/secret-repo, AeonForge-io/internal-*"
            style={{ width: "100%", padding: "0.5rem", margin: "0.75rem 0", borderRadius: "4px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}
          />
          <button type="submit" className="btn-admin btn-admin-primary">Save</button>
          {status && <p role="status">{status}</p>}
        </form>
      </div>
    </main>
  );
}
