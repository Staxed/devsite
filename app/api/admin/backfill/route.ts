export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { discoverRepos, backfillRepoCommits, backfillPRs } from "@/lib/github/backfill";

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: runs } = await supabase
    .from("sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(5);

  const { data: repos } = await supabase
    .from("tracked_repos")
    .select("*")
    .order("owner", { ascending: true });

  return NextResponse.json({ runs: runs || [], repos: repos || [] });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { action } = body;
  const supabase = createAdminClient();

  switch (action) {
    case "discover": {
      const repos = await discoverRepos();

      // Upsert into tracked_repos
      for (const repo of repos) {
        await supabase.from("tracked_repos").upsert(
          {
            provider_repo_id: String(repo.id),
            owner: repo.owner,
            name: repo.name,
            visibility: repo.visibility,
          },
          { onConflict: "provider_repo_id" }
        );
      }

      // Create a sync run
      const { data: run } = await supabase
        .from("sync_runs")
        .insert({ sync_type: "backfill", stats: { repos_discovered: repos.length } })
        .select()
        .single();

      return NextResponse.json({ repos, run });
    }

    case "backfill_repo": {
      const { repo_id, since } = body;
      if (!repo_id) {
        return NextResponse.json({ error: "repo_id is required" }, { status: 400 });
      }

      const sinceDate = since || new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

      // Get repo info from tracked_repos
      const { data: repo } = await supabase
        .from("tracked_repos")
        .select("*")
        .eq("provider_repo_id", String(repo_id))
        .single();

      if (!repo) {
        return NextResponse.json({ error: "Repo not found" }, { status: 404 });
      }

      const inserted = await backfillRepoCommits(
        {
          id: Number(repo.provider_repo_id),
          full_name: `${repo.owner}/${repo.name}`,
          owner: repo.owner,
          name: repo.name,
          visibility: repo.visibility as "public" | "private",
        },
        sinceDate
      );

      // Update sync state
      await supabase.from("sync_state").upsert(
        {
          sync_type: "backfill_commits",
          scope: repo.provider_repo_id,
          cursor: { last_since: sinceDate },
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "sync_type,scope" }
      );

      return NextResponse.json({ inserted, repo: `${repo.owner}/${repo.name}` });
    }

    case "backfill_prs": {
      const { since } = body;
      const sinceDate = since || new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

      const inserted = await backfillPRs(sinceDate);

      return NextResponse.json({ inserted });
    }

    case "finalize": {
      const { run_id } = body;
      if (!run_id) {
        return NextResponse.json({ error: "run_id is required" }, { status: 400 });
      }

      await supabase
        .from("sync_runs")
        .update({ status: "completed", finished_at: new Date().toISOString() })
        .eq("id", run_id);

      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
