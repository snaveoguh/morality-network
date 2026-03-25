/**
 * Tab manager — shows tab cards, allows switching/closing/creating tabs.
 * Rendered as a full-screen overlay when active.
 */
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';

const INK = '#1A1A1A';
const PAPER = '#F5F0E8';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

export interface Tab {
  id: string;
  url: string;
  title: string;
}

interface Props {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onDismiss: () => void;
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}

export function TabManager({
  tabs, activeTabId, onSelectTab, onCloseTab, onNewTab, onDismiss,
}: Props) {
  return (
    <View style={styles.overlay}>
      <View style={styles.header}>
        <Text style={styles.headerText}>{tabs.length} tab{tabs.length !== 1 ? 's' : ''}</Text>
        <TouchableOpacity onPress={onDismiss}>
          <Text style={styles.doneBtn}>Done</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.card,
              tab.id === activeTabId && styles.activeCard,
            ]}
            onPress={() => { onSelectTab(tab.id); onDismiss(); }}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {tab.title || extractDomain(tab.url)}
              </Text>
              <TouchableOpacity
                onPress={() => onCloseTab(tab.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardUrl} numberOfLines={1}>
                {extractDomain(tab.url)}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.newTabBtn} onPress={onNewTab}>
        <Text style={styles.newTabText}>+ New Tab</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 26, 26, 0.95)',
    zIndex: 100,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerText: { color: PAPER, fontSize: 18, fontWeight: '700' },
  doneBtn: { color: '#6CA0DC', fontSize: 16, fontWeight: '600' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 12,
    paddingBottom: 100,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.3,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activeCard: { borderColor: '#6CA0DC' },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#333',
  },
  cardTitle: { color: PAPER, fontSize: 12, fontWeight: '600', flex: 1, marginRight: 4 },
  closeBtn: { color: '#888', fontSize: 14, fontWeight: '600' },
  cardBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  cardUrl: { color: '#777', fontSize: 11, textAlign: 'center' },
  newTabBtn: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: PAPER,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 25,
  },
  newTabText: { color: INK, fontWeight: '700', fontSize: 16 },
});
