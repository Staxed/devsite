import vinextHandler from "vinext/server/fetch-handler";
import { createScheduled } from "./lib/cron/scheduled";

type Handler = { fetch: Parameters<typeof createScheduled>[0] };
const handler = vinextHandler as unknown as Handler;

export default {
  fetch: handler.fetch,
  scheduled: createScheduled(handler.fetch),
};
