import { headers } from 'next/headers';
import Web3ProviderWrapper from '@/components/pearls/web3-provider-wrapper';

export const metadata = {
  title: 'SeaLaife Pearls Tracker',
  description: 'Track Pearl NFT holdings, payouts, and ROI across Polygon and Base chains.',
};

export default async function PearlsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersObj = await headers();
  const cookies = headersObj.get('cookie');

  return (
    <Web3ProviderWrapper cookies={cookies}>
      {children}
    </Web3ProviderWrapper>
  );
}
