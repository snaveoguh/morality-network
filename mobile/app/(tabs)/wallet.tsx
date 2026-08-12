import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {
  getEvmAddress,
  getSolanaAddress,
  isLocked,
} from '../../lib/wallet';
import { getBalance } from '../../lib/evm-client';
import { getSolBalance } from '../../lib/solana-client';
import { shortenAddress, formatEth, formatSol } from '../../lib/entity';
import { getAccountMe, getStoredToken, signIn } from '../../lib/api';
import { PublicKey } from '@solana/web3.js';

const INK = '#1A1A1A';
const PAPER = '#F5F0E8';
const ACCENT = '#8B0000';

export default function WalletTab() {
  const [evmAddr, setEvmAddr] = useState<string | null>(null);
  const [solAddr, setSolAddr] = useState<string | null>(null);
  const [ethBalance, setEthBalance] = useState('0 ETH');
  const [solBalance, setSolBalance] = useState('0 SOL');
  const [locked, setLocked] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [points, setPoints] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  const loadState = useCallback(async () => {
    setLocked(isLocked());
    const evm = getEvmAddress();
    const sol = getSolanaAddress();
    setEvmAddr(evm);
    setSolAddr(sol);

    if (evm) {
      try {
        const bal = await getBalance(evm as `0x${string}`);
        setEthBalance(formatEth(bal));
      } catch { setEthBalance('? ETH'); }
    }
    if (sol) {
      try {
        const bal = await getSolBalance(new PublicKey(sol));
        setSolBalance(formatSol(Math.round(bal * 1e9)));
      } catch { setSolBalance('? SOL'); }
    }

    // Points — only meaningful once /api/auth/token + /api/account/me exist.
    const token = await getStoredToken();
    setSignedIn(!!token);
    if (token) {
      const me = await getAccountMe();
      setPoints(me?.points ?? null);
    } else {
      setPoints(null);
    }
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadState();
    setRefreshing(false);
  };

  const copyAddr = async (addr: string) => {
    await Clipboard.setStringAsync(addr);
    Alert.alert('Copied', 'Address copied to clipboard');
  };

  const handleSignIn = async () => {
    const result = await signIn();
    if (result.ok) {
      await loadState();
    } else if (result.reason === 'unavailable') {
      Alert.alert('Coming soon', 'Sign-in from mobile is not live yet.');
    } else if (result.reason === 'locked') {
      Alert.alert('Wallet locked', 'Unlock from Settings first.');
    } else {
      Alert.alert('Error', 'Sign-in failed. Try again later.');
    }
  };

  if (locked) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.title}>Wallet Locked</Text>
          <Text style={styles.subtitle}>Unlock from Settings</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.header}>Wallet</Text>

        {/* Points */}
        <View style={[styles.card, styles.pointsCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.pointsLabel}>WITNESS POINTS</Text>
            <Text style={styles.pointsValue}>{points !== null ? points : '—'}</Text>
          </View>
          {!signedIn && (
            <TouchableOpacity onPress={handleSignIn}>
              <Text style={styles.signInText}>Sign in with this wallet to see your balance</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* EVM (Base) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.chainLabel}>Base (ETH)</Text>
            <Text style={styles.balance}>{ethBalance}</Text>
          </View>
          {evmAddr && (
            <TouchableOpacity onPress={() => copyAddr(evmAddr)}>
              <Text style={styles.address}>{shortenAddress(evmAddr, 6)}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Solana */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.chainLabel}>Solana (SOL)</Text>
            <Text style={styles.balance}>{solBalance}</Text>
          </View>
          {solAddr && (
            <TouchableOpacity onPress={() => copyAddr(solAddr)}>
              <Text style={styles.address}>
                {solAddr.slice(0, 6)}...{solAddr.slice(-4)}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.freeLabel}>
          Tap an address to copy it. Witness today's claim to earn points.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER },
  content: { padding: 20, gap: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { fontSize: 28, fontFamily: 'serif', fontWeight: 'bold', color: INK },
  title: { fontSize: 22, fontWeight: 'bold', color: INK },
  subtitle: { fontSize: 14, color: '#666', marginTop: 8 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  pointsCard: { borderWidth: 2, borderColor: INK },
  pointsLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5, color: ACCENT },
  pointsValue: { fontSize: 26, fontWeight: '900', color: INK },
  signInText: { fontSize: 13, color: '#666', marginTop: 8, textDecorationLine: 'underline' },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chainLabel: { fontSize: 14, fontWeight: '600', color: '#666' },
  balance: { fontSize: 22, fontWeight: '700', color: INK },
  address: { fontSize: 13, color: '#999', marginTop: 8, fontFamily: 'monospace' },
  freeLabel: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
});
