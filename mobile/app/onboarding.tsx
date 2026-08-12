/**
 * Onboarding: welcome → create/import → PIN → mnemonic backup → 3-word verify → done.
 *
 * The 3-word check mirrors web/src/components/account/WalletSetup.tsx: three
 * distinct random words retyped from memory with the phrase hidden. That check
 * is the only defence against someone clicking through and discovering months
 * later that they never wrote the phrase down.
 *
 * There is deliberately NO password-recovery promise here: seed-phrase backup
 * is the only recovery path and the copy says so.
 */
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { createWallet, importWallet } from '../lib/wallet';

const INK = '#1A1A1A';
const PAPER = '#F5F0E8';
const ACCENT = '#8B0000';

const CONFIRM_COUNT = 3;

/** Pick n distinct indices in [0, size). Same shape as web's WalletSetup. */
function pickIndices(size: number, n: number): number[] {
  const pool = Array.from({ length: size }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).sort((a, b) => a - b);
}

type Step =
  | 'welcome'
  | 'create-pin'
  | 'show-mnemonic'
  | 'verify'
  | 'import'
  | 'import-pin';

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [pin, setPin] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [loading, setLoading] = useState(false);

  // 3-word backup check
  const [challenge, setChallenge] = useState<number[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);

  function finish() {
    setMnemonic('');
    setAnswers([]);
    setChallenge([]);
    router.replace('/(tabs)/feed');
  }

  async function handleCreate() {
    if (pin.length < 6) {
      Alert.alert('PIN must be at least 6 digits');
      return;
    }
    setLoading(true);
    try {
      const result = await createWallet(pin);
      setMnemonic(result.mnemonic);
      const words = result.mnemonic.split(' ');
      setChallenge(pickIndices(words.length, CONFIRM_COUNT));
      setAnswers(Array(CONFIRM_COUNT).fill(''));
      setStep('show-mnemonic');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  }

  function handleVerify() {
    const words = mnemonic.split(' ');
    const allCorrect = challenge.every(
      (wordIndex, i) => answers[i]?.trim().toLowerCase() === words[wordIndex],
    );
    if (allCorrect) {
      finish();
    } else {
      Alert.alert(
        'Not quite',
        'One or more words are wrong. Check your written backup and try again.',
      );
      setAnswers(Array(CONFIRM_COUNT).fill(''));
    }
  }

  async function handleImport() {
    if (pin.length < 6) {
      Alert.alert('PIN must be at least 6 digits');
      return;
    }
    setLoading(true);
    try {
      await importWallet(importMnemonic, pin);
      setImportMnemonic('');
      finish();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.logo}>P</Text>
      <Text style={styles.title}>pooter world</Text>
      <Text style={styles.subtitle}>the morality browser</Text>

      {step === 'welcome' && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setStep('create-pin')}
          >
            <Text style={styles.primaryBtnText}>Create New Wallet</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setStep('import')}
          >
            <Text style={styles.secondaryBtnText}>Import Existing Wallet</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'create-pin' && (
        <View style={styles.section}>
          <Text style={styles.label}>Set a PIN (6+ digits)</Text>
          <Text style={styles.hint}>
            The PIN encrypts your wallet on this device. It does not replace
            your recovery phrase.
          </Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            placeholder="Enter PIN"
            keyboardType="numeric"
            secureTextEntry
            maxLength={12}
          />
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleCreate}
            disabled={loading}
          >
            <Text style={styles.primaryBtnText}>
              {loading ? 'Creating...' : 'Create Wallet'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setStep('welcome'); setPin(''); }}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'show-mnemonic' && (
        <View style={styles.section}>
          <Text style={styles.label}>
            Write down these 12 words. This is your only backup — if you lose
            them, nobody can recover this wallet for you.
          </Text>
          <View style={styles.mnemonicBox}>
            {mnemonic.split(' ').map((word, i) => (
              <View key={i} style={styles.wordChip}>
                <Text style={styles.wordNum}>{i + 1}</Text>
                <Text style={styles.wordText}>{word}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setStep('verify')}
          >
            <Text style={styles.primaryBtnText}>I've Written Them Down</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'verify' && (
        <View style={styles.section}>
          <Text style={styles.label}>
            Prove it — enter these {CONFIRM_COUNT} words from your written
            backup. The phrase is hidden now.
          </Text>
          {challenge.map((wordIndex, i) => (
            <View key={wordIndex} style={{ gap: 6 }}>
              <Text style={styles.verifyLabel}>Word #{wordIndex + 1}</Text>
              <TextInput
                style={styles.input}
                value={answers[i]}
                onChangeText={(text) => {
                  setAnswers((prev) => {
                    const next = [...prev];
                    next[i] = text;
                    return next;
                  });
                }}
                placeholder={`Enter word #${wordIndex + 1}`}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ))}
          <TouchableOpacity style={styles.primaryBtn} onPress={handleVerify}>
            <Text style={styles.primaryBtnText}>Verify & Finish</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep('show-mnemonic')}>
            <Text style={styles.backText}>Show the words again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Import Flow ──────────────────────────────────────── */}

      {step === 'import' && (
        <View style={styles.section}>
          <Text style={styles.label}>Enter your 12-word recovery phrase</Text>
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
            value={importMnemonic}
            onChangeText={setImportMnemonic}
            placeholder="word1 word2 word3 ..."
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setStep('import-pin')}
          >
            <Text style={styles.primaryBtnText}>Next</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setStep('welcome'); setImportMnemonic(''); }}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'import-pin' && (
        <View style={styles.section}>
          <Text style={styles.label}>Set a PIN (6+ digits)</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            placeholder="Enter PIN"
            keyboardType="numeric"
            secureTextEntry
            maxLength={12}
          />
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleImport}
            disabled={loading}
          >
            <Text style={styles.primaryBtnText}>
              {loading ? 'Importing...' : 'Import Wallet'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setStep('import'); setPin(''); }}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER },
  content: { padding: 24, paddingTop: 80, alignItems: 'center' },
  logo: {
    fontSize: 64,
    fontFamily: 'serif',
    fontWeight: 'bold',
    color: PAPER,
    backgroundColor: INK,
    width: 80,
    height: 80,
    borderRadius: 16,
    textAlign: 'center',
    lineHeight: 80,
    overflow: 'hidden',
  },
  title: { fontSize: 28, fontFamily: 'serif', fontWeight: 'bold', color: INK, marginTop: 16 },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4, fontStyle: 'italic' },
  section: { width: '100%', marginTop: 32, gap: 16 },
  label: { fontSize: 16, color: INK, fontWeight: '600', lineHeight: 22 },
  hint: { fontSize: 13, color: '#666', lineHeight: 18 },
  verifyLabel: { fontSize: 12, fontWeight: '800', color: '#888', letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#FFF',
    color: INK,
  },
  primaryBtn: {
    backgroundColor: INK,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: PAPER, fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: INK,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryBtnText: { color: INK, fontSize: 16, fontWeight: '600' },
  backText: { textAlign: 'center', color: '#666', fontSize: 14, marginTop: 8 },
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
