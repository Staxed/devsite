import { decideTick } from "./tick";

export interface CronEnv {
  CRON_ENABLED?: string;
  CRON_SECRET?: string;
}

export interface CronCtx {
  waitUntil(p: Promise<unknown>): void;
}

export type WorkerFetch = (request: Request, env: CronEnv, ctx: CronCtx) => Promise<Response>;

export const CRON_PATHS = {
  poll: "/api/cron/poll-github",
  digest: "/api/cron/digest",
  summaries: "/api/cron/summaries",
};

export function createScheduled(workerFetch: WorkerFetch) {
  return async function scheduled(controller: { scheduledTime: number }, env: CronEnv, ctx: CronCtx) {
    const calls = decideTick(new Date(controller.scheduledTime), env.CRON_ENABLED);
    if (calls.length === 0) return;
    const secret = env.CRON_SECRET;
    if (!secret) throw new Error("CRON_SECRET is not set");

    // Sequential: the digest and summaries read what the poll just stored.
    const run = async () => {
      for (const call of calls) {
        const request = new Request(`https://staxed.dev${CRON_PATHS[call]}`, {
          method: "POST",
          headers: { "x-cron-secret": secret },
        });
        const response = await workerFetch(request, env, ctx);
        // One line per step in Workers Logs: the poll's fetched/newEvents, the digest's lines.
        const body = await response.text();
        if (!response.ok) throw new Error(`Cron ${call} failed: ${response.status} ${body}`);
        console.log(`Cron ${call}: ${body}`);
      }
    };
    ctx.waitUntil(run());
  };
}
