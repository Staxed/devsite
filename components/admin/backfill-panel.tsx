"use client";

import { useState } from "react";

interface Repo {
  id: number;
  full_name: string;
  owner: string;
  name: string;
  visibility: string;
}

interface RepoStatus {
  [repoId: string]: "pending" | "running" | "done" | "error";
}

export default function BackfillPanel() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoStatus, setRepoStatus] = useState<RepoStatus>({});
  const [discovering, setDiscovering] = useState(false);
  const [message, setMessage] = useState("");

  async function handleDiscover() {
    setDiscovering(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discover" }),
      });
      const data = await res.json();
      setRepos(data.repos || []);
      const status: RepoStatus = {};
      for (const repo of data.repos || []) {
        status[repo.id] = "pending";
      }
      setRepoStatus(status);
      setMessage(`Discovered ${data.repos?.length || 0} repos`);
    } catch {
      setMessage("Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }

  async function handleBackfillRepo(repo: Repo) {
    setRepoStatus((s) => ({ ...s, [repo.id]: "running" }));
    try {
      const res = await fetch("/api/admin/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backfill_repo", repo_id: repo.id }),
      });
      const data = await res.json();
      setRepoStatus((s) => ({ ...s, [repo.id]: "done" }));
      setMessage(`${repo.full_name}: ${data.inserted} events imported`);
    } catch {
      setRepoStatus((s) => ({ ...s, [repo.id]: "error" }));
    }
  }

  async function handleBackfillAll() {
    for (const repo of repos) {
      if (repoStatus[repo.id] !== "done") {
        await handleBackfillRepo(repo);
      }
    }
    setMessage("Backfill complete for all repos");
  }

  async function handleBackfillPRs() {
    setMessage("Backfilling PRs...");
    try {
      const res = await fetch("/api/admin/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backfill_prs" }),
      });
      const data = await res.json();
      setMessage(`PRs: ${data.inserted} events imported`);
    } catch {
      setMessage("PR backfill failed");
    }
  }

  const doneCount = Object.values(repoStatus).filter((s) => s === "done").length;
  const totalCount = repos.length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="backfill-panel">
      <div className="form-actions">
        <button
          className="btn-admin btn-admin-primary"
          onClick={handleDiscover}
          disabled={discovering}
        >
          {discovering ? "Discovering..." : "Discover Repos"}
        </button>
        {repos.length > 0 && (
          <>
            <button className="btn-admin btn-admin-primary" onClick={handleBackfillAll}>
              Backfill All Commits
            </button>
            <button className="btn-admin btn-admin-primary" onClick={handleBackfillPRs}>
              Backfill PRs
            </button>
          </>
        )}
      </div>

      {message && <p style={{ color: "var(--color-accent-sky)", fontSize: "0.85rem" }}>{message}</p>}

      {repos.length > 0 && (
        <>
          <div className="backfill-progress">
            <div className="backfill-progress-bar" style={{ width: `${progressPct}%` }} />
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
            {doneCount}/{totalCount} repos processed
          </p>
        </>
      )}

      {repos.map((repo) => (
        <div key={repo.id} className="backfill-repo">
          <div>
            <span style={{ fontSize: "0.9rem" }}>{repo.full_name}</span>
            <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
              ({repo.visibility})
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
              {repoStatus[repo.id] || "pending"}
            </span>
            {repoStatus[repo.id] !== "done" && repoStatus[repo.id] !== "running" && (
              <button
                className="btn-admin btn-admin-primary"
                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                onClick={() => handleBackfillRepo(repo)}
              >
                Backfill
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
