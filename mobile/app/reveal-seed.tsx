/**
 * PIN-gated recovery-phrase reveal. Replaces the old plain Alert, which threw
 * the mnemonic into a system dialog with no warnings and no PIN prompt UX.
 * The phrase only lives in local state while this screen is mounted and is
 * cleared on unmount.
 */
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMnemonic } from '../lib/wallet';

const INK = '#1A1A1A';
const PAPER = '#F5F0E8';
const ACCENT = '#8B0000';

export default function RevealSeedScreen() {
  const [pin, setPin] = useState('');
  const [words, setWords] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Drop the phrase from state the moment the screen goes away.
  useEffect(() => () => setWords(null), []);

  async function handleReveal() {
    if (!pin) return;
    setLoading(true);
    setError('');
    try {
      const mnemonic = await getMnemonic(pin);
      setWords(mnemonic.split(' '));
      setPin('');
    } catch (e: any) {
      setError(e.message || 'Could not unlock');
    }
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={INK} />
        </TouchableOpacity>

        <Text style={styles.title}>Recovery Phrase</Text>

        {!words ? (
          <View style={styles.section}>
            <Text style={styles.label}>Enter your PIN to reveal your 12 words.</Text>
            <TextInput
              style={styles.input}
              value={pin}
              onChangeText={setPin}
              placeholder="PIN"
              keyboardType="numeric"
              secureTextEntry
              autoFocus
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity style={styles.primaryBtn} onPress={handleReveal} disabled={loading}>
              <Text style={styles.primaryBtnText}>{loading ? 'Unlocking…' : 'Reveal'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.warningBox}>
              <Ionicons name="eye-off-outline" size={18} color={ACCENT} />
              <Text style={styles.warningText}>
                Anyone who sees these words can take everything in this wallet.
                Don't screenshot them — screenshots sync to cloud photo
                libraries. Make sure nobody is looking at your screen.
              </Text>
            </View>

            <View style={styles.mnemonicBox}>
              {words.map((word, i) => (
                <View key={i} style={styles.wordChip}>
                  <Text style={styles.wordNum}>{i + 1}</Text>
                  <Text style={styles.wordText}>{word}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                setWords(null);
                router.back();
              }}
            >
              <Text style={styles.primaryBtnText}>Done — hide the phrase</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER },
  content: { padding: 20, gap: 8 },
  backBtn: { marginBottom: 8 },
  title: { fontSize: 26, fontFamily: 'serif', fontWeight: '900', color: INK },
  section: { gap: 16, marginTop: 16 },
  label: { fontSize: 15, color: INK, fontWeight: '600', lineHeight: 21 },
  input: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#FFF',
    color: INK,
  },
  error: { fontSize: 13, color: ACCENT, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: INK,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: PAPER, fontSize: 16, fontWeight: '700' },
  warningBox: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    backgroundColor: '#F7E8E8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ACCENT,
    alignItems: 'flex-start',
  },
  warningText: { flex: 1, fontSize: 13, color: INK, lineHeight: 18 },
  mnemonicBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ACCENT,
  },
  wordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0EDE5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  wordNum: { fontSize: 11, color: '#999', fontWeight: '600' },
  wordText: { fontSize: 15, color: INK, fontWeight: '500' },
});
