import { bindings, defineConfig, defineWorker, triggers } from "cf/config";

// One Worker, staxed-devsite. Workers Builds deploys the production branch with
// `npm run deploy:vinext` (staxed.dev) and the test branch as a Preview with
// `npm run deploy:vinext:preview` (the script skips every branch but test).
export default defineConfig(({ isPreview }) => ({
  worker: defineWorker({
    name: "staxed-devsite",
    entrypoint: "./worker.ts",
    compatibilityDate: "2026-11-03",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    // Must match the custom domains on the Worker in the dashboard: the deploy runs
    // strict and aborts if they differ. test.staxed.dev serves Previews only.
    domains: [
      { hostname: "staxed.dev", production: true, previews: false },
      { hostname: "www.staxed.dev", production: true, previews: false },
      { hostname: "test.staxed.dev", production: false, previews: true },
    ],
    // Poll every 30 minutes; the scheduled handler decides what to run (lib/cron/tick.ts).
    // Previews reject the triggers field and never run cron, so a Preview build leaves it out.
    triggers: isPreview ? [] : [triggers.scheduled({ schedule: "*/30 * * * *" })],
    env: {
      ASSETS: bindings.assets(),
      // Values are set in Cloudflare (dashboard or `cf secrets`); locally they come from .dev.vars.
      NEXT_PUBLIC_SUPABASE_URL: bindings.secret(),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: bindings.secret(),
      SUPABASE_SERVICE_ROLE_KEY: bindings.secret(),
      NEXT_PUBLIC_REOWN_PROJECT_ID: bindings.secret(),
      NEXTAUTH_SECRET: bindings.secret(),
      NEXTAUTH_URL: bindings.secret(),
      NEXT_PUBLIC_SITE_URL: bindings.secret(),
      ADMIN_WALLET_ADDRESS: bindings.secret(),
      GITHUB_APP_ID: bindings.secret(),
      GITHUB_APP_PRIVATE_KEY: bindings.secret(),
      GITHUB_WEBHOOK_SECRET: bindings.secret(),
      DISCORD_APP_ID: bindings.secret(),
      DISCORD_PUBLIC_KEY: bindings.secret(),
      DISCORD_BOT_TOKEN: bindings.secret(),
      DISCORD_CHANNEL_ID: bindings.secret(),
      DISCORD_OWNER_ID: bindings.secret(),
      GITHUB_EVENTS_TOKEN: bindings.secret(),
      CRON_SECRET: bindings.secret(),
      CRON_ENABLED: bindings.secret(),
    },
  }),
}));
