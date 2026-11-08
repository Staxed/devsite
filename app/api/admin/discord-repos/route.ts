import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth/admin";
import { createSupabaseStore } from "@/lib/activity/store";
import { discoverRepos } from "@/lib/github/backfill";
import { buildRepoList, parseRepoFullName, planRepoSave } from "@/lib/discord/repo-list";

export const runtime = "edge";

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function GET() {
  if (!(await verifyAdmin())) return unauthorized();

  const store = createSupabaseStore();
  const repos = await buildRepoList(store, await discoverRepos());
  return NextResponse.json({ repos });
}

/** Save the Include and display-name edits. */
export async function PUT(request: NextRequest) {
  if (!(await verifyAdmin())) return unauthorized();

  const store = createSupabaseStore();
  const body = await request.json();
  const list = await buildRepoList(store, await discoverRepos());
  const plan = planRepoSave(list, body.repos);
  if ("error" in plan) return NextResponse.json({ error: plan.error }, { status: 400 });

  await store.saveDiscordRepos(plan.rows);
  return NextResponse.json({ saved: plan.rows.length });
}

/** Add repo: a new unticked row for an owner/repo typed in by hand. */
export async function POST(request: NextRequest) {
  if (!(await verifyAdmin())) return unauthorized();

  const { repo_full_name } = await request.json();
  const repo = parseRepoFullName(repo_full_name);
  if (!repo) return NextResponse.json({ error: "repo_full_name must be owner/repo" }, { status: 400 });

  const store = createSupabaseStore();
  const saved = await store.listDiscordRepos();
  if (!saved.some((row) => row.repo_full_name === repo)) {
    await store.saveDiscordRepos([{ repo_full_name: repo, display_name: null, included: false }]);
  }
  return NextResponse.json({ repo_full_name: repo }, { status: 201 });
}
