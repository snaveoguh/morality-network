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
  unlock,
  lock,
} from '../../lib/wallet';
import { getBalance } from '../../lib/evm-client';
import { getSolBalance } from '../../lib/solana-client';
import { shortenAddress, formatEth, formatSol } from '../../lib/entity';
import { PublicKey } from '@solana/web3.js';

const INK = '#1A1A1A';
const PAPER = '#F5F0E8';

export default function WalletTab() {
  const [evmAddr, setEvmAddr] = useState<string | null>(null);
  const [solAddr, setSolAddr] = useState<string | null>(null);
  const [ethBalance, setEthBalance] = useState('0 ETH');
  const [solBalance, setSolBalance] = useState('0 SOL');
  const [locked, setLocked] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn}>
            <Text style={styles.actionText}>Send</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Text style={styles.actionText}>Bridge</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.freeLabel}>
          Rating & commenting on Solana is free — we pay the fees.
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chainLabel: { fontSize: 14, fontWeight: '600', color: '#666' },
  balance: { fontSize: 22, fontWeight: '700', color: INK },
  address: { fontSize: 13, color: '#999', marginTop: 8, fontFamily: 'monospace' },
  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flex: 1,
    backgroundColor: INK,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionText: { color: PAPER, fontSize: 16, fontWeight: '700' },
  freeLabel: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
});
