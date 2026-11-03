import { decideTick } from "./lib/cron/tick";
import { default as openNextWorker } from "./.open-next/worker.js";

interface CronEnv {
  CRON_ENABLED?: string;
  CRON_SECRET?: string;
}

const CRON_PATHS = {
  poll: "/api/cron/poll-github",
  summaries: "/api/cron/summaries",
};

export default {
  fetch: openNextWorker.fetch,

  async scheduled(controller: { scheduledTime: number }, env: CronEnv, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const calls = decideTick(new Date(controller.scheduledTime), env.CRON_ENABLED);
    if (calls.length === 0) return;
    if (!env.CRON_SECRET) throw new Error("CRON_SECRET is not set");

    // Sequential: summaries read what the poll just stored.
    const run = async () => {
      for (const call of calls) {
        const request = new Request(`https://staxed.dev${CRON_PATHS[call]}`, {
          method: "POST",
          headers: { "x-cron-secret": env.CRON_SECRET! },
        });
        const response = await openNextWorker.fetch(request, env, ctx);
        if (!response.ok) throw new Error(`Cron ${call} failed: ${response.status}`);
      }
    };
    ctx.waitUntil(run());
  },
};
