"use client";

import { useState } from "react";
import { twoYearsBefore } from "@/lib/dates";

interface Repo {
  id: number;
  full_name: string;
  owner: string;
  name: string;
  visibility: string;
  included: boolean;
  is_new: boolean;
  backfilled_at: string | null;
}

interface RepoStatus {
  [repoId: string]: "pending" | "running" | "done" | "error";
}

export default function BackfillPanel() {
  // Fixed when discovery is triggered, so every step of one backfill shares the same window
  const [run, setRun] = useState<{ id: string; since: string } | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoStatus, setRepoStatus] = useState<RepoStatus>({});
  const [discovering, setDiscovering] = useState(false);
  const [message, setMessage] = useState("");
  // Saved display names from Settings, sent back unchanged when toggling Include
  const [displayNames, setDisplayNames] = useState<Record<string, string | null>>({});

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
      setRun({ id: data.run.id, since: twoYearsBefore(new Date()) });
      const found: Repo[] = data.repos || [];
      setRepos(found);
      try {
        const saved = await fetch("/api/admin/discord-repos");
        const savedData = await saved.json();
        const names: Record<string, string | null> = {};
        for (const r of savedData.repos || []) names[r.repo_full_name] = r.display_name ?? null;
        setDisplayNames(names);
      } catch {
        setDisplayNames({});
      }
      const status: RepoStatus = {};
      for (const repo of data.repos || []) {
        status[repo.id] = "pending";
      }
      setRepoStatus(status);
      const newCount = found.filter((r) => r.is_new).length;
      const includedCount = found.filter((r) => r.included).length;
      setMessage(`Discovered ${found.length} repos (${newCount} new), ${includedCount} included`);
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
        body: JSON.stringify({ action: "backfill_repo", repo_id: repo.id, since: run?.since }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const errors: string[] = data.errors || [];
      if (errors.length > 0) {
        // Some sections failed: the repo stays to backfill, and running it again adds only what is missing
        setRepoStatus((s) => ({ ...s, [repo.id]: "error" }));
        setMessage(`${repo.full_name}: ${data.inserted} events imported, but ${errors.join("; ")}`);
        return;
      }
      setRepoStatus((s) => ({ ...s, [repo.id]: "done" }));
      setRepos((rs) => rs.map((r) => (r.id === repo.id ? { ...r, backfilled_at: new Date().toISOString() } : r)));
      setMessage(`${repo.full_name}: ${data.inserted} events imported`);
    } catch {
      setRepoStatus((s) => ({ ...s, [repo.id]: "error" }));
    }
  }

  // Every included repo, backfilled before or not: the same work as each row's Backfill button.
  // Re-running is safe; events are deduplicated, so only what is missing is added.
  const toBackfill = repos.filter((r) => r.included);

  async function handleBackfillIncluded() {
    for (const repo of toBackfill) {
      await handleBackfillRepo(repo);
    }
    setMessage("Backfill complete for included repos");
  }

  async function handleToggleInclude(repo: Repo, included: boolean) {
    const setIncluded = (value: boolean) =>
      setRepos((rs) => rs.map((r) => (r.id === repo.id ? { ...r, included: value } : r)));
    setIncluded(included);
    try {
      const res = await fetch("/api/admin/discord-repos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repos: [{ repo_full_name: repo.full_name, included, display_name: displayNames[repo.full_name] ?? null }],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setIncluded(!included);
        setMessage(data.error || "Could not save the Include tick");
      }
    } catch {
      setIncluded(!included);
      setMessage("Could not save the Include tick");
    }
  }

  async function handleFinalize() {
    if (!run) return;
    setMessage("Awarding achievements from the stored history...");
    try {
      const res = await fetch("/api/admin/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize", run_id: run.id, since: run.since }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(`Backfill finalized: ${data.achievements} achievements recorded, nothing posted to Discord`);
    } catch (err) {
      setMessage(`Finalize failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  const includedRepos = repos.filter((r) => r.included);
  const doneCount = includedRepos.filter((r) => repoStatus[r.id] === "done").length;
  const totalCount = includedRepos.length;
  const rank = (r: Repo) => (r.included ? 0 : r.is_new ? 1 : 2);
  const sortedRepos = [...repos].sort((a, b) => rank(a) - rank(b) || a.full_name.localeCompare(b.full_name));
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
            <button className="btn-admin btn-admin-primary" onClick={handleBackfillIncluded} disabled={toBackfill.length === 0}>
              Backfill Included ({toBackfill.length})
            </button>
            <button className="btn-admin btn-admin-primary" onClick={handleFinalize}>
              Finalize (award achievements)
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
            {doneCount}/{totalCount} included repos backfilled this run
          </p>
        </>
      )}

      {sortedRepos.map((repo) => (
        <div key={repo.id} className="backfill-repo">
          <div>
            <label style={{ marginRight: "0.5rem" }}>
              <input
                type="checkbox"
                checked={repo.included}
                onChange={(e) => handleToggleInclude(repo, e.target.checked)}
              />{" "}
              Include
            </label>
            <span style={{ fontSize: "0.9rem" }}>{repo.full_name}</span>
            <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
              ({repo.visibility})
            </span>
            {repo.is_new && (
              <span style={{ marginLeft: "0.5rem", fontSize: "0.7rem", color: "var(--color-accent-sky)" }}>New</span>
            )}
            {repo.backfilled_at && (
              <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                backfilled {new Date(repo.backfilled_at).toLocaleDateString()}
              </span>
            )}
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
