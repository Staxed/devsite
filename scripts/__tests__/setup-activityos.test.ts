import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function run(input: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "wizard-"));
  const log = path.join(dir, "calls.log");
  const npx = path.join(dir, "npx");
  writeFileSync(npx, `#!/usr/bin/env bash\necho "$@" >> "${log}"\ncase "$*" in *secret*) cat > /dev/null;; esac\n`);
  chmodSync(npx, 0o755);
  const res = spawnSync("bash", [path.resolve(__dirname, "../setup-activityos.sh")], {
    input,
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
  });
  return { status: res.status, calls: existsSync(log) ? readFileSync(log, "utf8") : "" };
}

describe("setup-activityos.sh", () => {
  it("stops at step 0 when the Worker is not confirmed", () => {
    const r = run("no\n");
    expect(r.status).toBe(1);
    expect(r.calls).toBe("");
  });

  it("stops before any secret is written when production is not confirmed", () => {
    const r = run("yes\n\n\nid\ntok\nno\n");
    expect(r.status).toBe(1);
    expect(r.calls).not.toContain("secret put");
  });

  it("aborts on an empty required secret", () => {
    const r = run("yes\n\n\nid\ntok\nyes\n\n");
    expect(r.status).toBe(1);
    expect(r.calls).not.toContain("secret put");
  });

  it("allows GITHUB_EVENTS_TOKEN alone to be skipped", () => {
    const r = run("yes\n\n\nid\ntok\nyes\na\nb\nc\nd\ne\n\nf\n");
    expect(r.calls).toContain("secret put CRON_SECRET --name staxed-devsite");
    expect(r.calls).not.toContain("secret put GITHUB_EVENTS_TOKEN");
  });
});
