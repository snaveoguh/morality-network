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

type Step = 'welcome' | 'create-pin' | 'show-mnemonic' | 'verify' | 'import' | 'import-pin';

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [pin, setPin] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [verifyWord, setVerifyWord] = useState('');
  const [verifyIndex, setVerifyIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (pin.length < 6) {
      Alert.alert('PIN must be at least 6 digits');
      return;
    }
    setLoading(true);
    try {
      const result = await createWallet(pin);
      setMnemonic(result.mnemonic);
      setVerifyIndex(Math.floor(Math.random() * 12));
      setStep('show-mnemonic');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  }

  function handleVerify() {
    const words = mnemonic.split(' ');
    if (verifyWord.trim().toLowerCase() === words[verifyIndex]) {
      router.replace('/(tabs)/browser');
    } else {
      Alert.alert('Wrong word', `Word #${verifyIndex + 1} is incorrect. Try again.`);
      setVerifyWord('');
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
      router.replace('/(tabs)/browser');
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
            Write down these 12 words. This is your only backup.
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
            What is word #{verifyIndex + 1}?
          </Text>
          <TextInput
            style={styles.input}
            value={verifyWord}
            onChangeText={setVerifyWord}
            placeholder={`Enter word #${verifyIndex + 1}`}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={handleVerify}>
            <Text style={styles.primaryBtnText}>Verify</Text>
          </TouchableOpacity>
        </View>
      )}

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
  label: { fontSize: 16, color: INK, fontWeight: '600' },
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
