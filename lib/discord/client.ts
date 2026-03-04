const DISCORD_API_BASE = "https://discord.com/api/v10";

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  url?: string;
  thumbnail?: { url: string };
  footer?: { text: string; icon_url?: string };
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
}

export interface DiscordMessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
}

function getBotToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN not set");
  return token;
}

export async function sendChannelMessage(
  channelId: string,
  payload: DiscordMessagePayload
): Promise<{ id: string } | null> {
  const res = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${getBotToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error(`Discord API error: ${res.status} ${await res.text()}`);
    return null;
  }

  return res.json();
}

/**
 * Send embeds to a channel, batching into messages of max 10 embeds each.
 * Returns array of message IDs for successfully sent messages.
 */
export async function sendEmbeds(
  channelId: string,
  embeds: DiscordEmbed[]
): Promise<string[]> {
  const messageIds: string[] = [];
  const batchSize = 10;

  for (let i = 0; i < embeds.length; i += batchSize) {
    const batch = embeds.slice(i, i + batchSize);
    const result = await sendChannelMessage(channelId, { embeds: batch });
    if (result) {
      messageIds.push(result.id);
    }
  }

  return messageIds;
}
