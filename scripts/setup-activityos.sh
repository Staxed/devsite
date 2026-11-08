#!/usr/bin/env bash
# Interactive ActivityOS setup: walks every manual step in order.
# Secrets are read silently and piped straight into `wrangler secret put`; nothing is written to a file.
set -euo pipefail

cd "$(dirname "$0")/.."

SITE_URL="https://staxed.dev"
INTERACTIONS_URL="$SITE_URL/api/discord/interactions"
WEBHOOK_URL="$SITE_URL/api/github/webhook"
WORKER_NAME="staxed-devsite"

step() { printf '\n== Step %s: %s\n' "$1" "$2"; }
say() { printf '%s\n' "$@"; }
pause() { read -r -p "Press Enter when done... " _; }

put_secret() {
  local name="$1" optional="${2:-required}" value
  read -r -s -p "$name: " value
  printf '\n'
  if [ -z "$value" ]; then
    if [ "$optional" = "optional" ]; then
      say "$name skipped; set it later (step 7)."
      return 0
    fi
    say "$name is empty; aborting." >&2
    exit 1
  fi
  printf '%s' "$value" | npx wrangler secret put "$name" --name "$WORKER_NAME"
}

step 0 "Confirm staxed.dev is served by the $WORKER_NAME Worker"
say "devsite#22 step 3 creates the $WORKER_NAME Worker, builds it from the production branch and moves staxed.dev to it."
say "This wizard does not deploy or move domains. Steps 4, 8 and 9 need that code live on $SITE_URL."
read -r -p "Is staxed.dev served by the $WORKER_NAME Worker? Type yes to continue: " served_ok
if [ "$served_ok" != "yes" ]; then
  say "Finish devsite#22 step 3 first, then rerun." >&2
  exit 1
fi

step 1 "Create the Stixed bot and invite it"
say "1. Open https://discord.com/developers/applications and click New Application, named Stixed."
say "2. Under Bot, click Reset Token and keep the token for step 3. Copy the Application ID and, from General Information, the Public Key."
say "3. Under OAuth2 > URL Generator pick scopes bot and applications.commands, permissions Send Messages and Embed Links, open the URL and invite the bot to the Aeon Forge server."
pause

step 2 "Clear the Forge Bot's commands and Interactions Endpoint URL"
say "1. Open the Forge Bot application > General Information."
say "2. If Interactions Endpoint URL points at staxed.dev, clear the field and save."
pause
say "Now the Forge Bot's commands are cleared with its own app id and token (typed here, held in memory only)."
read -r -p "Forge Bot DISCORD_APP_ID: " forge_app_id
read -r -s -p "Forge Bot DISCORD_BOT_TOKEN: " forge_bot_token
printf '\n'
DISCORD_APP_ID="$forge_app_id" DISCORD_BOT_TOKEN="$forge_bot_token" npx tsx scripts/register-discord-commands.ts --clear
unset forge_app_id forge_bot_token

step 3 "Set the Cloudflare secrets (production)"
say "Each value is piped into wrangler secret put."
say "Use the Stixed bot's values for DISCORD_APP_ID, DISCORD_PUBLIC_KEY and DISCORD_BOT_TOKEN."
say "DISCORD_CHANNEL_ID is the Aeon Forge activity channel (1437115510558036115)."
say "DISCORD_OWNER_ID is your Discord user id (Developer Mode on, right-click yourself, Copy User ID)."
say "GITHUB_EVENTS_TOKEN comes from step 7; if you have it already, paste it now, otherwise press Enter to skip it and set it in step 7."
say "CRON_SECRET is any long random string."
say "Every secret is written to the Worker named $WORKER_NAME (--name $WORKER_NAME), the production Worker."
read -r -p "Is $WORKER_NAME the production Worker? Type yes to continue: " target_ok
if [ "$target_ok" != "yes" ]; then
  say "Aborting; the secrets must go to the production Worker." >&2
  exit 1
fi
for name in DISCORD_APP_ID DISCORD_PUBLIC_KEY DISCORD_BOT_TOKEN DISCORD_CHANNEL_ID DISCORD_OWNER_ID GITHUB_EVENTS_TOKEN CRON_SECRET; do
  if [ "$name" = "GITHUB_EVENTS_TOKEN" ]; then
    put_secret "$name" optional
  else
    put_secret "$name"
  fi
done
say "CRON_ENABLED turns on the schedule: the hourly digest, achievements and the 09:00 daily, weekly and monthly summaries."
say "Leave it off to set up and test first: nothing posts on its own, and you can still post one digest by hand with POST $SITE_URL/api/cron/digest and the x-cron-secret header."
read -r -p "Turn on the schedule now? Type yes to turn it on, Enter to leave it off: " cron_on
if [ "$cron_on" = "yes" ]; then
  printf 'true' | npx wrangler secret put CRON_ENABLED --name "$WORKER_NAME"
  say "CRON_ENABLED=true set; cron triggers run only on the production deployment, never on test-branch Previews."
else
  printf 'false' | npx wrangler secret put CRON_ENABLED --name "$WORKER_NAME"
  say "CRON_ENABLED=false set: nothing posts on its own. Turn it on later with:"
  say "  printf true | npx wrangler secret put CRON_ENABLED --name $WORKER_NAME"
fi
say "Redeploy the $WORKER_NAME Worker (Workers Builds: Retry the latest production-branch build, or npm run deploy:vinext) so the secrets and cron trigger are live before step 4."
pause

step 4 "Set the Stixed bot's Interactions Endpoint URL"
say "Stixed application > General Information > Interactions Endpoint URL:"
say "  $INTERACTIONS_URL"
say "Save; Discord sends a verification ping and only saves if the deployed Worker answers it."
pause

step 5 "Register the commands on the Stixed bot"
read -r -p "Stixed DISCORD_APP_ID: " stixed_app_id
read -r -s -p "Stixed DISCORD_BOT_TOKEN: " stixed_bot_token
printf '\n'
DISCORD_APP_ID="$stixed_app_id" DISCORD_BOT_TOKEN="$stixed_bot_token" npx tsx scripts/register-discord-commands.ts
unset stixed_app_id stixed_bot_token

step 6 "Supabase: check, then fix"
say "In the Supabase SQL editor run supabase/sql/activityos-check.sql and note which rows say present = false."
pause
say "Then paste and run supabase/sql/activityos-fix.sql (idempotent), and run the check again; every row should be present."
pause

step 7 "Create GITHUB_EVENTS_TOKEN"
say "1. Open https://github.com/settings/tokens/new (classic personal access token)."
say "2. Select scopes read:user and repo, generate, and copy the token."
say "3. If you skipped GITHUB_EVENTS_TOKEN in step 3, set it now:"
read -r -p "Set GITHUB_EVENTS_TOKEN now? [y/N] " answer
if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
  put_secret GITHUB_EVENTS_TOKEN
fi

step 8 "GitHub App webhook"
say "1. Open the GitHub App settings > General."
say "2. Webhook URL: $WEBHOOK_URL"
say "3. Webhook secret: a long random string. Set the same value as a Cloudflare secret:"
put_secret GITHUB_WEBHOOK_SECRET
say "4. Tick Active, save, and check Advanced > Recent Deliveries shows a 200 for the ping."
pause

step 9 "Trigger the two-year backfill"
say "Open $SITE_URL/activity/admin/backfill, sign in as admin and run the backfill with its default since (two years back)."
say "It posts nothing to Discord."
pause

say ""
say "Done. Demo: tick a repo on $SITE_URL/activity/admin/settings, push a commit in it, see it on $SITE_URL/activity and in the next top-of-hour digest in the activity channel, then run /stats and /activity repos."
