import { auth } from "@/lib/auth/config";
import { ADMIN_WALLET_ADDRESS } from "@/lib/constants";

export async function verifyAdmin(): Promise<{ address: string } | null> {
  const session = await auth();
  if (!session?.address) return null;
  if (session.address.toLowerCase() !== ADMIN_WALLET_ADDRESS.toLowerCase()) {
    return null;
  }
  return { address: session.address };
}
