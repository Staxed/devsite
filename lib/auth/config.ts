import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { SIWESession } from "@reown/appkit-siwe";
import {
  verifySignature,
  getChainIdFromMessage,
  getAddressFromMessage,
} from "@reown/appkit-siwe";
import { ADMIN_WALLET_ADDRESS } from "@/lib/constants";
import { parseSessionSubject, sessionSubject } from "@/lib/auth/subject";

declare module "next-auth" {
  interface Session extends SIWESession {
    address: string;
    chainId: number;
  }
}

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    Credentials({
      name: "Ethereum",
      credentials: {
        message: { label: "Message", type: "text" },
        signature: { label: "Signature", type: "text" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.message || !credentials?.signature) return null;

          const message = credentials.message as string;
          const signature = credentials.signature as string;
          const address = getAddressFromMessage(message);
          const chainId = getChainIdFromMessage(message);

          // Only allow the admin wallet
          if (address.toLowerCase() !== ADMIN_WALLET_ADDRESS.toLowerCase()) {
            return null;
          }

          const isValid = await verifySignature({
            address,
            message,
            signature,
            chainId,
            projectId: projectId!,
          });

          if (isValid) {
            return { id: sessionSubject(chainId, address) };
          }

          return null;
        } catch {
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    session({ session, token }) {
      if (!token.sub) return session;

      const parsed = parseSessionSubject(token.sub);
      if (parsed) {
        session.address = parsed.address;
        session.chainId = parsed.chainId;
      }

      return session;
    },
  },
});
