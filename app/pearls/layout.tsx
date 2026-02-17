import { headers } from 'next/headers';
import Web3Provider from '@/components/pearls/web3-provider';

export const metadata = {
  title: 'Pearls Tracker',
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
    <Web3Provider cookies={cookies}>
      {children}
    </Web3Provider>
  );
}
