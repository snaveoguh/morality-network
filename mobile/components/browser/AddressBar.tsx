import { useState, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';

const INK = '#1A1A1A';

interface Props {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onRefresh: () => void;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export function AddressBar({
  url, title, canGoBack, canGoForward,
  onNavigate, onGoBack, onGoForward, onRefresh,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<TextInput>(null);

  function handleFocus() {
    setEditing(true);
    setInputValue(url);
  }

  function handleSubmit() {
    setEditing(false);
    if (inputValue.trim()) {
      onNavigate(inputValue.trim());
    }
  }

  function handleBlur() {
    setEditing(false);
  }

  return (
    <View style={styles.bar}>
      <TouchableOpacity
        onPress={onGoBack}
        disabled={!canGoBack}
        style={styles.navBtn}
      >
        <Text style={[styles.navIcon, !canGoBack && styles.disabled]}>‹</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onGoForward}
        disabled={!canGoForward}
        style={styles.navBtn}
      >
        <Text style={[styles.navIcon, !canGoForward && styles.disabled]}>›</Text>
      </TouchableOpacity>

      <TextInput
        ref={inputRef}
        style={styles.input}
        value={editing ? inputValue : extractDomain(url)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChangeText={setInputValue}
        onSubmitEditing={handleSubmit}
        placeholder="Search or enter URL"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        selectTextOnFocus
      />

      <TouchableOpacity onPress={onRefresh} style={styles.navBtn}>
        <Text style={styles.navIcon}>↻</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#DDD',
    backgroundColor: '#F5F0E8',
  },
  navBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navIcon: { fontSize: 22, color: INK, fontWeight: '600' },
  disabled: { color: '#CCC' },
  input: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: INK,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
});
