export async function verifyGitHubWebhook(
  payload: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expected = `sha256=${Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;

  // Use double-HMAC for timing-safe comparison:
  // HMAC both strings with a random key, then compare the MACs.
  // crypto.subtle.verify is guaranteed constant-time.
  const compareKey = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  const expectedMac = await crypto.subtle.sign("HMAC", compareKey, encoder.encode(expected));
  return crypto.subtle.verify("HMAC", compareKey, expectedMac, encoder.encode(signature));
}
