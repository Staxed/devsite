import { verifyKey } from "discord-interactions";

export async function verifyDiscordRequest(
  body: string,
  signature: string | null,
  timestamp: string | null
): Promise<boolean> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey || !signature || !timestamp) return false;

  return verifyKey(body, signature, timestamp, publicKey);
}
