import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { discoverRepos, backfillRepoCommits, backfillRepoPRs, backfillPRs } from "@/lib/github/backfill";
import { backfillRepoActivity } from "@/lib/github/backfill-activity";
import { createSupabaseStore } from "@/lib/activity/store";
import { replayAchievements } from "@/lib/achievements/engine";
import { getSettings } from "@/lib/settings";
import { toDateInTimezone, todayInTimezone, twoYearsBefore } from "@/lib/dates";

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
      const discovered = await discoverRepos();
      const repos = discovered.filter((repo) => !repo.archived);

      const [{ data: existing }, { data: syncRows }, discordRepos] = await Promise.all([
        supabase.from("tracked_repos").select("provider_repo_id"),
        supabase.from("sync_state").select("scope, last_synced_at").eq("sync_type", "backfill_commits"),
        createSupabaseStore().listDiscordRepos(),
      ]);
      const knownIds = new Set((existing || []).map((r: { provider_repo_id: string }) => r.provider_repo_id));
      const backfilledAt = new Map(
        (syncRows || []).map((r: { scope: string; last_synced_at: string | null }) => [r.scope, r.last_synced_at])
      );
      const includedByName = new Map(discordRepos.map((r) => [r.repo_full_name, r.included]));

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

      const annotated = repos.map((repo) => ({
        ...repo,
        included: includedByName.get(repo.full_name) ?? false,
        is_new: !knownIds.has(String(repo.id)),
        backfilled_at: backfilledAt.get(String(repo.id)) ?? null,
      }));

      return NextResponse.json({ repos: annotated, run });
    }

    case "backfill_repo": {
      const { repo_id, since } = body;
      if (!repo_id) {
        return NextResponse.json({ error: "repo_id is required" }, { status: 400 });
      }

      const sinceDate = since || twoYearsBefore(new Date());

      // Get repo info from tracked_repos
      const { data: repo } = await supabase
        .from("tracked_repos")
        .select("*")
        .eq("provider_repo_id", String(repo_id))
        .single();

      if (!repo) {
        return NextResponse.json({ error: "Repo not found" }, { status: 404 });
      }

      const discovered = {
        id: Number(repo.provider_repo_id),
        full_name: `${repo.owner}/${repo.name}`,
        owner: repo.owner,
        name: repo.name,
        visibility: repo.visibility as "public" | "private",
      };

      const commits = await backfillRepoCommits(discovered, sinceDate);
      const prs = await backfillRepoPRs(discovered, sinceDate);
      // Sections of this one fail on their own and come back in `errors`; commits and PRs above throw
      const activity = await backfillRepoActivity(discovered, sinceDate);
      const inserted = commits + prs + activity.inserted;

      // A repo with a failed section stays "to backfill" so it can be run again; stored events are never duplicated
      if (activity.errors.length === 0) {
        await supabase.from("sync_state").upsert(
          {
            sync_type: "backfill_commits",
            scope: repo.provider_repo_id,
            cursor: { last_since: sinceDate },
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "sync_type,scope" }
        );
      }

      return NextResponse.json({ inserted, repo: `${repo.owner}/${repo.name}`, found: activity.found, errors: activity.errors });
    }

    case "backfill_prs": {
      const { since } = body;
      const sinceDate = since || twoYearsBefore(new Date());

      const included = new Set(
        (await createSupabaseStore().listDiscordRepos()).filter((r) => r.included).map((r) => r.repo_full_name)
      );
      const inserted = await backfillPRs(sinceDate, undefined, included);

      return NextResponse.json({ inserted });
    }

    case "finalize": {
      const { run_id, since } = body;
      if (!run_id) {
        return NextResponse.json({ error: "run_id is required" }, { status: 400 });
      }
      if (!since) {
        return NextResponse.json({ error: "since is required" }, { status: 400 });
      }

      // Silent: records the achievements the stored history earned, with their historical periods
      const { timezone } = await getSettings();
      const achievements = await replayAchievements(
        createSupabaseStore(),
        toDateInTimezone(since, timezone),
        todayInTimezone(timezone)
      );

      await supabase
        .from("sync_runs")
        .update({ status: "completed", finished_at: new Date().toISOString() })
        .eq("id", run_id);

      return NextResponse.json({ ok: true, achievements });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
