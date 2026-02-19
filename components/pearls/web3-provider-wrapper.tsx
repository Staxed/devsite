'use client';

import dynamic from 'next/dynamic';

const Web3Provider = dynamic(
  () => import('@/components/pearls/web3-provider'),
  { ssr: false }
);

export default function Web3ProviderWrapper({
  cookies,
  children,
}: {
  cookies: string | null;
  children: React.ReactNode;
}) {
  return <Web3Provider cookies={cookies}>{children}</Web3Provider>;
}
