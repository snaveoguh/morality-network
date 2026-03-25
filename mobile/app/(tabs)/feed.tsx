import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const INK = '#1A1A1A';
const PAPER = '#F5F0E8';

export default function FeedTab() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.header}>Feed</Text>
        <Text style={styles.body}>
          Curated content from the morality network. Top-rated entities,
          trending discussions, and editorial picks.
        </Text>
        <Text style={styles.placeholder}>Coming soon</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER },
  content: { padding: 20, gap: 12 },
  header: { fontSize: 28, fontFamily: 'serif', fontWeight: 'bold', color: INK },
  body: { fontSize: 15, color: '#444', lineHeight: 22 },
  placeholder: { fontSize: 14, color: '#999', fontStyle: 'italic', marginTop: 20 },
});
