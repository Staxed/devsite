import { bindings, defineConfig, defineWorker } from "cf/config";

// Two Workers from one repo: `--mode test` (the test branch) builds devsite-test,
// any other mode builds the production Worker, devsite.
export default defineConfig(({ mode }) => ({
  worker: defineWorker({
    name: mode === "test" ? "devsite-test" : "devsite",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-03",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
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
      CRON_SECRET: bindings.secret(),
    },
  }),
}));
