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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { lock, getMnemonic, deleteWallet, isLocked, unlock } from '../../lib/wallet';

const INK = '#1A1A1A';
const PAPER = '#F5F0E8';
const ACCENT = '#8B0000';

export default function SettingsTab() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const locked = isLocked();

  async function handleUnlock() {
    if (!pin) return;
    try {
      await unlock(pin);
      setPin('');
      Alert.alert('Unlocked', 'Wallet unlocked successfully');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  function handleLock() {
    lock();
    Alert.alert('Locked', 'Wallet locked');
  }

  async function handleShowMnemonic() {
    if (!pin) {
      Alert.alert('Enter PIN', 'Enter your PIN to reveal recovery phrase');
      return;
    }
    try {
      const mnemonic = await getMnemonic(pin);
      Alert.alert('Recovery Phrase', mnemonic, [{ text: 'OK' }]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function handleDeleteWallet() {
    Alert.alert(
      'Delete Wallet',
      'This will permanently delete your wallet. Make sure you have backed up your recovery phrase!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteWallet();
            router.replace('/onboarding');
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Settings</Text>

        {/* Unlock / Lock */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          {locked ? (
            <View style={styles.row}>
              <TextInput
                style={styles.input}
                value={pin}
                onChangeText={setPin}
                placeholder="Enter PIN to unlock"
                keyboardType="numeric"
                secureTextEntry
              />
              <TouchableOpacity style={styles.btn} onPress={handleUnlock}>
                <Text style={styles.btnText}>Unlock</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.btn} onPress={handleLock}>
              <Text style={styles.btnText}>Lock Wallet</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Backup */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Backup</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={pin}
              onChangeText={setPin}
              placeholder="Enter PIN"
              keyboardType="numeric"
              secureTextEntry
            />
            <TouchableOpacity style={styles.btn} onPress={handleShowMnemonic}>
              <Text style={styles.btnText}>Show Phrase</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Danger zone */}
        <View style={[styles.section, { marginTop: 40 }]}>
          <Text style={[styles.sectionTitle, { color: ACCENT }]}>Danger Zone</Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: ACCENT }]}
            onPress={handleDeleteWallet}
          >
            <Text style={styles.btnText}>Delete Wallet</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>pooter world v0.1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER },
  content: { padding: 20, gap: 16 },
  header: { fontSize: 28, fontFamily: 'serif', fontWeight: 'bold', color: INK },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: INK },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#FFF',
  },
  btn: {
    backgroundColor: INK,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  btnText: { color: PAPER, fontWeight: '700', fontSize: 14 },
  version: { textAlign: 'center', color: '#999', fontSize: 12, marginTop: 40 },
});
