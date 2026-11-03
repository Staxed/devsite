import { createScheduled } from "./lib/cron/scheduled";
import { default as openNextWorker } from "./.open-next/worker.js";

export default {
  fetch: openNextWorker.fetch,
  scheduled: createScheduled(openNextWorker.fetch as Parameters<typeof createScheduled>[0]),
};
