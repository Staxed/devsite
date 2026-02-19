'use client';

import { useEffect } from 'react';
import { AppKitButton, useAppKitAccount, useAppKitBalance } from '@reown/appkit/react';

export default function ConnectButton() {
  const { isConnected } = useAppKitAccount();
  const { fetchBalance } = useAppKitBalance();

  useEffect(() => {
    if (isConnected) {
      const timer = setTimeout(() => {
        fetchBalance().catch(() => {});
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isConnected, fetchBalance]);

  return <AppKitButton />;
}
