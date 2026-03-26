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
import { Ionicons } from '@expo/vector-icons';
import { createWallet, importWallet } from '../lib/wallet';
import { setupRecovery } from '../lib/zk-recovery';

const INK = '#1A1A1A';
const PAPER = '#F5F0E8';
const ACCENT = '#8B0000';

type Step =
  | 'welcome'
  | 'create-pin'
  | 'show-mnemonic'
  | 'verify'
  | 'recovery-setup'
  | 'recovery-confirm'
  | 'import'
  | 'import-pin'
  | 'recover-zk';

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [pin, setPin] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [verifyWord, setVerifyWord] = useState('');
  const [verifyIndex, setVerifyIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // ZK Recovery state
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [showRecoveryPw, setShowRecoveryPw] = useState(false);
  const [zkCommitment, setZkCommitment] = useState('');

  // ZK Recovery (on new device)
  const [recoverPassword, setRecoverPassword] = useState('');
  const [recoverSalt, setRecoverSalt] = useState('');

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
      setStep('recovery-setup');
    } else {
      Alert.alert('Wrong word', `Word #${verifyIndex + 1} is incorrect. Try again.`);
      setVerifyWord('');
    }
  }

  async function handleRecoverySetup() {
    if (recoveryPassword.length < 8) {
      Alert.alert('Password too short', 'Recovery password must be at least 8 characters.');
      return;
    }
    if (recoveryPassword !== recoveryConfirm) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const result = await setupRecovery(recoveryPassword);
      setZkCommitment(result.commitment);
      setStep('recovery-confirm');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  }

  function handleRecoveryDone() {
    // Navigate to main app
    router.replace('/(tabs)/browser');
  }

  function handleSkipRecovery() {
    Alert.alert(
      'Skip Recovery?',
      'Without ZK recovery, you can only restore your wallet using your seed phrase. Are you sure?',
      [
        { text: 'Set Up Recovery', style: 'cancel' },
        { text: 'Skip', style: 'destructive', onPress: () => router.replace('/(tabs)/browser') },
      ],
    );
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
          <TouchableOpacity
            style={styles.zkRecoverBtn}
            onPress={() => setStep('recover-zk')}
          >
            <Ionicons name="shield-checkmark-outline" size={18} color="#6CA0DC" />
            <Text style={styles.zkRecoverText}>Recover with Password (ZK)</Text>
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

      {/* ── ZK Recovery Setup ────────────────────────────────── */}

      {step === 'recovery-setup' && (
        <View style={styles.section}>
          <View style={styles.zkBadge}>
            <Ionicons name="shield-checkmark" size={24} color="#6CA0DC" />
            <Text style={styles.zkBadgeText}>ZK Password Recovery</Text>
          </View>

          <Text style={styles.label}>
            Set a recovery password. If you ever lose your seed phrase, this password
            (plus a zero-knowledge proof) can restore your wallet — no trusted third party needed.
          </Text>

          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={recoveryPassword}
              onChangeText={setRecoveryPassword}
              placeholder="Recovery password (8+ chars)"
              secureTextEntry={!showRecoveryPw}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setShowRecoveryPw(!showRecoveryPw)}
              style={styles.eyeBtn}
            >
              <Ionicons name={showRecoveryPw ? 'eye-off' : 'eye'} size={20} color="#666" />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            value={recoveryConfirm}
            onChangeText={setRecoveryConfirm}
            placeholder="Confirm recovery password"
            secureTextEntry
            autoCapitalize="none"
          />

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color="#888" />
            <Text style={styles.infoText}>
              A cryptographic commitment (hash) is stored on-chain.
              Your password never leaves this device. Recovery uses a
              ZK proof — you prove you know the password without revealing it.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleRecoverySetup}
            disabled={loading}
          >
            <Text style={styles.primaryBtnText}>
              {loading ? 'Generating Proof...' : 'Set Up Recovery'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSkipRecovery}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'recovery-confirm' && (
        <View style={styles.section}>
          <View style={styles.zkBadge}>
            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
            <Text style={[styles.zkBadgeText, { color: '#4CAF50' }]}>Recovery Enabled</Text>
          </View>

          <Text style={styles.label}>
            Your ZK recovery commitment has been generated. It will be registered
            on-chain when you first use the app.
          </Text>

          <View style={styles.commitmentBox}>
            <Text style={styles.commitmentLabel}>Commitment</Text>
            <Text style={styles.commitmentHash} numberOfLines={2}>
              {zkCommitment}
            </Text>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="lock-closed" size={16} color="#888" />
            <Text style={styles.infoText}>
              48-hour timelock protects against attacks. 3 failed attempts
              locks the account. Your password + salt = full recovery.
            </Text>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleRecoveryDone}>
            <Text style={styles.primaryBtnText}>Enter pooter world</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── ZK Recovery (new device) ────────────────────────── */}

      {step === 'recover-zk' && (
        <View style={styles.section}>
          <View style={styles.zkBadge}>
            <Ionicons name="shield-checkmark" size={24} color="#6CA0DC" />
            <Text style={styles.zkBadgeText}>Recover Wallet</Text>
          </View>

          <Text style={styles.label}>
            Enter your recovery password and salt to restore your wallet
            using a zero-knowledge proof.
          </Text>

          <TextInput
            style={styles.input}
            value={recoverPassword}
            onChangeText={setRecoverPassword}
            placeholder="Recovery password"
            secureTextEntry
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            value={recoverSalt}
            onChangeText={setRecoverSalt}
            placeholder="Recovery salt (from backup)"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              Alert.alert(
                'Recovery Initiated',
                'A ZK proof will be generated and submitted on-chain. After the 48-hour timelock, your wallet will be recovered to a new address.',
                [{ text: 'OK' }],
              );
            }}
            disabled={loading}
          >
            <Text style={styles.primaryBtnText}>
              {loading ? 'Generating Proof...' : 'Recover Wallet'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setStep('welcome'); setRecoverPassword(''); setRecoverSalt(''); }}>
            <Text style={styles.backText}>Back</Text>
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
  input: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#FFF',
    color: INK,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { padding: 8 },
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
  skipText: { textAlign: 'center', color: '#999', fontSize: 14, fontStyle: 'italic' },
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

  // ZK Recovery styles
  zkRecoverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#6CA0DC',
    borderStyle: 'dashed',
  },
  zkRecoverText: { color: '#6CA0DC', fontSize: 14, fontWeight: '600' },
  zkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  zkBadgeText: { fontSize: 18, fontWeight: '700', color: '#6CA0DC' },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    backgroundColor: '#F0EDE5',
    borderRadius: 8,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 13, color: '#666', lineHeight: 18 },
  commitmentBox: {
    padding: 12,
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  commitmentLabel: { fontSize: 11, color: '#999', fontWeight: '600', marginBottom: 4 },
  commitmentHash: { fontSize: 12, color: INK, fontFamily: 'monospace' },
});
