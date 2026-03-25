import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { hasWallet } from '../lib/wallet';

export default function RootLayout() {
  const [walletExists, setWalletExists] = useState<boolean | null>(null);

  useEffect(() => {
    hasWallet().then(setWalletExists);
  }, []);

  if (walletExists === null) return null; // loading

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{ headerShown: false }}
        initialRouteName={walletExists ? '(tabs)' : 'onboarding'}
      >
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="recover" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
