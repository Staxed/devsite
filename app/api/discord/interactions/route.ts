export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { InteractionType, InteractionResponseType } from "discord-interactions";
import { verifyDiscordRequest } from "@/lib/discord/verify";
import {
  handleLog,
  handleHabitDone,
  handleStats,
  handleActivityStats,
  handleActivityStreak,
  handleActivityRepos,
  handleActivityInsights,
  handleActivityBadges,
} from "@/lib/discord/handlers";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");

  const isValid = await verifyDiscordRequest(body, signature, timestamp);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let interaction;
  try {
    interaction = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Handle PING
  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  // Handle application commands
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = interaction.data;

    let response;
    switch (name) {
      case "log":
        response = await handleLog(options || []);
        break;
      case "habit":
        response = await handleHabitDone(options || []);
        break;
      case "stats":
        response = await handleStats(options || []);
        break;
      case "activity": {
        const subCommand = options?.[0];
        const subName = subCommand?.name;
        const subOptions = subCommand?.options || [];
        switch (subName) {
          case "stats":
            response = await handleActivityStats(subOptions);
            break;
          case "streak":
            response = await handleActivityStreak();
            break;
          case "repos":
            response = await handleActivityRepos(subOptions);
            break;
          case "insights":
            response = await handleActivityInsights();
            break;
          case "badges":
            response = await handleActivityBadges();
            break;
          default:
            response = { content: `Unknown activity subcommand: ${subName}` };
        }
        break;
      }
      default:
        response = { content: `Unknown command: ${name}` };
    }

    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: response,
    });
  }

  return NextResponse.json({ error: "Unknown interaction type" }, { status: 400 });
}
