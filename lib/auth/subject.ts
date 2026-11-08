// The session's JWT subject is "<chainId>:<address>". The SIWE helper returns
// the chain as a CAIP id ("eip155:1"), so authorize keeps only its number, and
// parsing reads the last two parts so a CAIP-prefixed subject still parses.
export function sessionSubject(caipChainId: string, address: string): string {
  const chainNumber = caipChainId.split(":").pop() ?? "";
  return `${chainNumber}:${address}`;
}

export function parseSessionSubject(
  sub: string
): { address: string; chainId: number } | null {
  const parts = sub.split(":");
  if (parts.length < 2) return null;
  const address = parts[parts.length - 1];
  const chainId = parseInt(parts[parts.length - 2], 10);
  if (!/^0x[a-fA-F0-9]{40}$/.test(address) || Number.isNaN(chainId)) return null;
  return { address, chainId };
}
