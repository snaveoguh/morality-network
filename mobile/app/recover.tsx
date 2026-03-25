import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const INK = '#1A1A1A';
const PAPER = '#F5F0E8';
const ACCENT = '#6CA0DC';
const DANGER = '#8B0000';

type Step = 'password' | 'address' | 'proving' | 'pending' | 'done' | 'error';

export default function RecoverScreen() {
  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [timelockEnd, setTimelockEnd] = useState<Date | null>(null);

  const handleSubmitPassword = () => {
    if (password.length < 8) {
      setError('Recovery password must be at least 8 characters');
      return;
    }
    setError('');
    setStep('address');
  };

  const handleSubmitAddress = async () => {
    if (!newAddress.match(/^0x[a-fA-F0-9]{40}$/) && newAddress.length < 32) {
      setError('Enter a valid EVM (0x...) or Solana address');
      return;
    }
    setError('');
    setStep('proving');

    try {
      // TODO: Wire up actual ZK proof generation
      // 1. Fetch commitment + nonce from chain
      // 2. Load salt from secure storage
      // 3. Generate Groth16 proof via sdk/src/zk-recovery.ts
      // 4. Submit initiateRecovery() tx

      // Simulate proof generation delay
      await new Promise((r) => setTimeout(r, 3000));

      // Simulated success
      const executeAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
      setTimelockEnd(executeAfter);
      setTxHash('0x' + 'a'.repeat(64)); // placeholder
      setStep('pending');
    } catch (err: any) {
      setError(err.message || 'Proof generation failed');
      setStep('error');
    }
  };

  const handleExecute = async () => {
    try {
      // TODO: Call executeRecovery() on-chain
      Alert.alert('Recovery Executed', 'Your wallet has been recovered to the new address.');
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Execution failed');
    }
  };

  const formatCountdown = () => {
    if (!timelockEnd) return '';
    const diff = timelockEnd.getTime() - Date.now();
    if (diff <= 0) return 'Ready to execute';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m remaining`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Header */}
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={INK} />
          </TouchableOpacity>

          <View style={styles.logoBox}>
            <Ionicons name="shield-checkmark-outline" size={48} color={INK} />
          </View>
          <Text style={styles.title}>ZK Password Recovery</Text>
          <Text style={styles.subtitle}>
            Recover your wallet with your password. No seed phrase needed.
            Your password never leaves this device.
          </Text>

          {/* Step 1: Password */}
          {step === 'password' && (
            <View style={styles.stepBox}>
              <Text style={styles.stepLabel}>STEP 1 — ENTER RECOVERY PASSWORD</Text>
              <TextInput
                style={styles.input}
                placeholder="Your recovery password"
                placeholderTextColor="#999"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                autoFocus
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmitPassword}>
                <Text style={styles.primaryBtnText}>Continue</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Step 2: New Address */}
          {step === 'address' && (
            <View style={styles.stepBox}>
              <Text style={styles.stepLabel}>STEP 2 — NEW WALLET ADDRESS</Text>
              <Text style={styles.hint}>
                Enter the address of your new wallet. This is where your
                recovery commitment will be transferred after the 24h timelock.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="0x... or Solana address"
                placeholderTextColor="#999"
                value={newAddress}
                onChangeText={setNewAddress}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmitAddress}>
                <Text style={styles.primaryBtnText}>Generate ZK Proof & Submit</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Step 3: Proving */}
          {step === 'proving' && (
            <View style={styles.stepBox}>
              <ActivityIndicator size="large" color={INK} />
              <Text style={styles.provingText}>Generating zero-knowledge proof...</Text>
              <Text style={styles.hint}>
                Your password is being used to create a cryptographic proof
                locally on this device. It will never be sent anywhere.
              </Text>
            </View>
          )}

          {/* Step 4: Pending (timelock) */}
          {step === 'pending' && (
            <View style={styles.stepBox}>
              <Ionicons name="time-outline" size={48} color={ACCENT} />
              <Text style={styles.pendingTitle}>Recovery Initiated</Text>
              <Text style={styles.countdown}>{formatCountdown()}</Text>
              <Text style={styles.hint}>
                A 24-hour timelock is active. The original wallet owner can
                cancel this recovery during this window. After the timelock
                expires, anyone can execute the recovery.
              </Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>New Address</Text>
                <Text style={styles.infoValue} numberOfLines={1}>
                  {newAddress}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Transaction</Text>
                <Text style={styles.infoValue} numberOfLines={1}>
                  {txHash}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  timelockEnd && timelockEnd.getTime() > Date.now()
                    ? styles.disabledBtn
                    : null,
                ]}
                onPress={handleExecute}
                disabled={!!timelockEnd && timelockEnd.getTime() > Date.now()}
              >
                <Text style={styles.primaryBtnText}>Execute Recovery</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Step 5: Done */}
          {step === 'done' && (
            <View style={styles.stepBox}>
              <Ionicons name="checkmark-circle-outline" size={64} color="#2D8B4E" />
              <Text style={styles.pendingTitle}>Recovery Complete</Text>
              <Text style={styles.hint}>
                Your recovery commitment has been transferred to your new wallet
                address. You can now set up a new recovery password in Settings.
              </Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => router.replace('/(tabs)/wallet')}
              >
                <Text style={styles.primaryBtnText}>Go to Wallet</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Error */}
          {step === 'error' && (
            <View style={styles.stepBox}>
              <Ionicons name="alert-circle-outline" size={48} color={DANGER} />
              <Text style={styles.error}>{error}</Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => setStep('password')}
              >
                <Text style={styles.primaryBtnText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER },
  scroll: { padding: 20, paddingBottom: 60 },
  backBtn: { marginBottom: 16 },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#E8E0D4',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontFamily: 'serif',
    fontWeight: '900',
    color: INK,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  stepBox: {
    gap: 16,
    alignItems: 'center',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#888',
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: INK,
    backgroundColor: '#FFF',
  },
  hint: {
    fontSize: 13,
    color: '#777',
    lineHeight: 19,
    textAlign: 'center',
  },
  error: {
    fontSize: 13,
    color: DANGER,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: INK,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: PAPER,
    fontWeight: '700',
    fontSize: 16,
  },
  disabledBtn: { opacity: 0.4 },
  provingText: {
    fontSize: 16,
    fontWeight: '700',
    color: INK,
    marginTop: 8,
  },
  pendingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: INK,
    marginTop: 8,
  },
  countdown: {
    fontSize: 28,
    fontWeight: '900',
    color: ACCENT,
    fontFamily: 'monospace',
  },
  infoRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#DDD',
  },
  infoLabel: { fontSize: 13, color: '#888', fontWeight: '600' },
  infoValue: { fontSize: 13, color: INK, maxWidth: '60%' },
});
