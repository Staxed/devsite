"use client";

import { useEffect, useState } from "react";
import type { RepoListEntry } from "@/lib/discord/repo-list";

const inputStyle = { padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" };

export default function SettingsPage() {
  const [excludedRepos, setExcludedRepos] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState("");
  const [repos, setRepos] = useState<RepoListEntry[]>([]);
  const [newRepo, setNewRepo] = useState("");
  const [repoStatus, setRepoStatus] = useState("");

  async function loadRepos() {
    const res = await fetch("/api/admin/discord-repos");
    if (!res.ok) {
      setRepoStatus(`Could not load repos (${res.status}): ${(await res.json()).error}`);
      return;
    }
    setRepos((await res.json()).repos);
  }

  function editRepo(name: string, change: Partial<RepoListEntry>) {
    setRepos((all) => all.map((r) => (r.repo_full_name === name ? { ...r, ...change } : r)));
  }

  async function saveRepos() {
    const res = await fetch("/api/admin/discord-repos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repos }),
    });
    if (!res.ok) {
      setRepoStatus(`Save failed: ${(await res.json()).error}`);
      return;
    }
    setRepoStatus("Saved.");
    await loadRepos();
  }

  async function addRepo() {
    const res = await fetch("/api/admin/discord-repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_full_name: newRepo }),
    });
    if (!res.ok) {
      setRepoStatus(`Add failed: ${(await res.json()).error}`);
      return;
    }
    setNewRepo("");
    setRepoStatus("Added.");
    await loadRepos();
  }

  useEffect(() => {
    loadRepos();
    async function load() {
      const res = await fetch("/api/admin/settings");
      if (!res.ok) {
        setStatus(`Could not load settings (${res.status}); saving is disabled.`);
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      const row = (data.settings || []).find((s: { key: string }) => s.key === "excluded_repos");
      setExcludedRepos(row?.value ?? "");
      setLoading(false);
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loadFailed) return;
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
          <button type="submit" disabled={loadFailed} className="btn-admin btn-admin-primary">Save</button>
          {status && <p role="status">{status}</p>}
        </form>
      </div>

      <div className="admin-section">
        <h2 className="admin-section-title">Discord repos</h2>
        <p className="admin-list-item-meta">
          Ticked repos appear in the hourly Discord digest. A private repo shows only its display name, so it needs
          one. A ticked public repo with no name shows its short repo name. This list does not affect the site.
        </p>
        {repos.map((repo) => (
          <div key={repo.repo_full_name} className="admin-list-item" style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ minWidth: "14rem" }}>{repo.repo_full_name}</span>
            <span className="admin-list-item-meta">{repo.visibility}</span>
            <label>
              <input
                type="checkbox"
                checked={repo.included}
                onChange={(e) => editRepo(repo.repo_full_name, { included: e.target.checked })}
              />{" "}
              Include
            </label>
            <input
              type="text"
              aria-label={`Display name for ${repo.repo_full_name}`}
              value={repo.display_name ?? ""}
              onChange={(e) => editRepo(repo.repo_full_name, { display_name: e.target.value })}
              placeholder="Display name"
              style={inputStyle}
            />
            {repo.needs_name && <strong role="alert">needs a name</strong>}
          </div>
        ))}
        <div style={{ display: "flex", gap: "0.75rem", margin: "0.75rem 0" }}>
          <input
            type="text"
            aria-label="Add repo"
            value={newRepo}
            onChange={(e) => setNewRepo(e.target.value)}
            placeholder="owner/repo"
            style={inputStyle}
          />
          <button type="button" onClick={addRepo} className="btn-admin">Add repo</button>
        </div>
        <button type="button" onClick={saveRepos} className="btn-admin btn-admin-primary">Save repos</button>
        {repoStatus && <p role="status">{repoStatus}</p>}
      </div>
    </main>
  );
}
