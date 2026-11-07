// Browser-only: Reown's web components extend HTMLElement, which does not
// exist in the Workers runtime, so this module must never load during SSR.
// AppKitProvider imports it from an effect.
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { mainnet } from "@reown/appkit/networks";
import { siweConfig } from "@/lib/auth/siwe-config";
import { BASE_URL } from "@/lib/constants";

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID!;

const networks: [typeof mainnet] = [mainnet];

const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
});

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  siweConfig,
  metadata: {
    name: "Staxed.dev",
    description: "ActivityOS Admin",
    url: BASE_URL,
    icons: [`${BASE_URL}/assets/StaxedDragonAvatar.jpg`],
  },
  features: {
    analytics: false,
  },
});
