import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { hasWallet } from '../lib/wallet';

export default function Index() {
  const [walletExists, setWalletExists] = useState<boolean | null>(null);

  useEffect(() => {
    hasWallet().then(setWalletExists);
  }, []);

  if (walletExists === null) return null;

  return <Redirect href={walletExists ? '/(tabs)/wallet' : '/onboarding'} />;
}
