/**
 * Run once to register Discord slash commands:
 *   npx tsx scripts/register-discord-commands.ts
 *
 * Requires DISCORD_APP_ID and DISCORD_BOT_TOKEN env vars.
 */

import { COMMANDS } from "../lib/discord/commands";

const APP_ID = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APP_ID || !BOT_TOKEN) {
  console.error("Set DISCORD_APP_ID and DISCORD_BOT_TOKEN environment variables");
  process.exit(1);
}

const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;

async function register() {
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(COMMANDS),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Failed to register commands: ${res.status} ${text}`);
    process.exit(1);
  }

  const data = await res.json();
  console.log(`Registered ${data.length} commands:`);
  for (const cmd of data) {
    console.log(`  /${cmd.name} — ${cmd.description}`);
  }
}

register();
