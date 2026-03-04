"use client";

import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { mainnet } from "@reown/appkit/networks";
import { siweConfig } from "@/lib/auth/siwe-config";

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID!;

const queryClient = new QueryClient();

const networks: [typeof mainnet] = [mainnet];

const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
});

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  siweConfig,
  metadata: {
    name: "Staxed.dev",
    description: "ActivityOS Admin",
    url: "https://staxed.dev",
    icons: ["https://staxed.dev/assets/StaxedDragonAvatar.jpg"],
  },
  features: {
    analytics: false,
  },
});

export default function AppKitProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
