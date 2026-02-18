'use client';

import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cookieToInitialState, WagmiProvider, type Config, http, fallback } from 'wagmi';
import { cookieStorage, createStorage } from '@wagmi/core';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { createAppKit } from '@reown/appkit/react';
import { polygon, base } from '@reown/appkit/networks';
import {
  type SIWESession,
  type SIWECreateMessageArgs,
  createSIWEConfig,
  formatMessage,
} from '@reown/appkit-siwe';
import type { AppKitNetwork } from '@reown/appkit/networks';

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

if (!projectId) {
  throw new Error('NEXT_PUBLIC_REOWN_PROJECT_ID is not defined');
}

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [polygon, base];

const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId,
  networks,
  transports: {
    [polygon.id]: fallback([
      http(`https://matic.nownodes.io/${process.env.NEXT_PUBLIC_NOWNODES_API_KEY}`),
      http('https://rpc.ankr.com/polygon'),
    ]),
    [base.id]: fallback([
      http('https://mainnet.base.org'),
      http('https://rpc.ankr.com/base'),
    ]),
  },
});

async function getNonce(): Promise<string> {
  const res = await fetch('/api/pearls/auth/nonce', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch nonce');
  const data = await res.json();
  return data.nonce;
}

async function getSession(): Promise<SIWESession | null> {
  const res = await fetch('/api/pearls/auth/session', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.address && data.chainId) {
    return { address: data.address, chainId: data.chainId };
  }
  return null;
}

async function verifyMessage({
  message,
  signature,
}: {
  message: string;
  signature: string;
}): Promise<boolean> {
  try {
    const res = await fetch('/api/pearls/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message, signature }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function signOut(): Promise<boolean> {
  const res = await fetch('/api/pearls/auth/signout', {
    method: 'POST',
    credentials: 'include',
  });
  return res.ok;
}

const siweConfig = createSIWEConfig({
  getMessageParams: async () => ({
    domain: typeof window !== 'undefined' ? window.location.host : '',
    uri: typeof window !== 'undefined' ? window.location.origin : '',
    chains: [137, 8453],
    statement: 'Sign in to SeaLaife Pearls Tracker.',
  }),
  createMessage: ({ address, ...args }: SIWECreateMessageArgs) =>
    formatMessage(args, address),
  getNonce,
  getSession,
  verifyMessage,
  signOut,
  signOutOnDisconnect: true,
});

const metadata = {
  name: 'SeaLaife Pearls Tracker',
  description: 'Track Pearl NFT holdings, payouts, and ROI',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://staxed.dev',
  icons: ['/assets/StaxedDragonAvatar.jpg'],
};

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  defaultNetwork: polygon,
  customRpcUrls: {
    'eip155:137': [{ url: `https://matic.nownodes.io/${process.env.NEXT_PUBLIC_NOWNODES_API_KEY}` }],
    'eip155:8453': [{ url: 'https://mainnet.base.org' }],
  },
  metadata,
  siweConfig,
  features: {
    analytics: false,
  },
});

const queryClient = new QueryClient();

export default function Web3Provider({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies: string | null;
}) {
  const initialState = cookieToInitialState(
    wagmiAdapter.wagmiConfig as Config,
    cookies
  );

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
