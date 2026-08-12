/**
 * Today tab — the v1 home. One simple daily action: see today's claim,
 * witness it (Support / Dispute / Can't verify), then read the feed.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { isLocked } from '../../lib/wallet';
import {
  getOpenRounds,
  submitVote,
  type OpenRound,
  type Verdict,
} from '../../lib/api';

const INK = '#1A1A1A';
const PAPER = '#F5F0E8';
const RULE = '#D4C9B8';
const ACCENT = '#8B0000';
const API_BASE = 'https://pooter.world';

interface FeedItem {
  id: string;
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  category: string;
  imageUrl?: string;
  tags?: string[];
}

const CATEGORIES = ['All', 'World', 'Politics', 'Tech', 'Crypto', 'Science', 'Business'];

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const mins = Math.floor((now - then) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ── Today's Claim (Daily Witness) ────────────────────────────────────

type WitnessState =
  | 'idle'
  | 'submitting'
  | 'done'
  | 'coming_soon'
  | 'locked'
  | 'error';

function TodayClaimCard() {
  const router = useRouter();
  const [rounds, setRounds] = useState<OpenRound[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<WitnessState>('idle');

  useEffect(() => {
    let cancelled = false;
    getOpenRounds().then((r) => {
      if (cancelled) return;
      setRounds(r);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Endpoint missing (feature off) or nothing open → no card at all.
  if (!loaded || rounds === null || rounds.length === 0) return null;

  const round = rounds[0];

  async function witness(verdict: Verdict) {
    if (isLocked()) {
      setState('locked');
      return;
    }
    setState('submitting');
    const result = await submitVote(round.id, verdict);
    if (result === 'ok') setState('done');
    else if (result === 'coming_soon') setState('coming_soon');
    else if (result === 'locked') setState('locked');
    else setState('error');
  }

  return (
    <View style={claimStyles.card}>
      <Text style={claimStyles.kicker}>TODAY'S CLAIM</Text>
      <Text style={claimStyles.claim}>{round.claimText}</Text>
      {round.entity ? <Text style={claimStyles.entity}>— {round.entity}</Text> : null}

      {state === 'idle' && (
        <View style={claimStyles.buttons}>
          <TouchableOpacity
            style={[claimStyles.btn, claimStyles.supportBtn]}
            onPress={() => witness('support')}
          >
            <Text style={claimStyles.btnTextLight}>Support</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[claimStyles.btn, claimStyles.disputeBtn]}
            onPress={() => witness('dispute')}
          >
            <Text style={claimStyles.btnTextLight}>Dispute</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[claimStyles.btn, claimStyles.cantBtn]}
            onPress={() => witness('cant_verify')}
          >
            <Text style={claimStyles.btnTextDark}>Can't verify</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === 'submitting' && <ActivityIndicator color={INK} style={{ marginTop: 12 }} />}

      {state === 'done' && (
        <Text style={claimStyles.status}>Witnessed. Thank you — points on their way.</Text>
      )}
      {state === 'coming_soon' && (
        <Text style={claimStyles.status}>Witnessing from mobile is coming soon.</Text>
      )}
      {state === 'locked' && (
        <TouchableOpacity onPress={() => router.push('/(tabs)/settings')}>
          <Text style={[claimStyles.status, { color: ACCENT }]}>
            Unlock your wallet in Settings to witness, then try again.
          </Text>
        </TouchableOpacity>
      )}
      {state === 'error' && (
        <TouchableOpacity onPress={() => setState('idle')}>
          <Text style={[claimStyles.status, { color: ACCENT }]}>
            Something went wrong. Tap to try again.
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Feed ─────────────────────────────────────────────────────────────

function FeedCard({ item }: { item: FeedItem }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.source}>{item.source}</Text>
        <Text style={styles.category}>{item.category}</Text>
        <Text style={styles.time}>{timeAgo(item.pubDate)}</Text>
      </View>

      <TouchableOpacity
        onPress={() => Linking.openURL(item.link)}
        activeOpacity={0.7}
      >
        <View style={styles.cardBody}>
          <View style={styles.textCol}>
            <Text style={styles.title} numberOfLines={3}>
              {item.title}
            </Text>
            <Text style={styles.description} numberOfLines={2}>
              {item.description}
            </Text>
          </View>
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          ) : null}
        </View>
      </TouchableOpacity>

      {/* Tags */}
      {item.tags && item.tags.length > 0 && (
        <View style={styles.tags}>
          {item.tags.slice(0, 3).map((tag) => (
            <Text key={tag} style={styles.tag}>#{tag}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

export default function FeedTab() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');

  const fetchFeed = useCallback(async () => {
    try {
      const catParam = activeCategory !== 'All' ? `?category=${activeCategory}` : '';
      const res = await fetch(`${API_BASE}/api/feed${catParam}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error('Feed fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    setLoading(true);
    fetchFeed();
  }, [fetchFeed]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFeed();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>pooter.world</Text>
        <Text style={styles.headerSub}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          }).toUpperCase()}
        </Text>
      </View>

      {/* Category filter */}
      <FlatList
        data={CATEGORIES}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catBar}
        keyExtractor={(c) => c}
        renderItem={({ item: cat }) => (
          <TouchableOpacity
            onPress={() => setActiveCategory(cat)}
            style={[
              styles.catPill,
              activeCategory === cat && styles.catPillActive,
            ]}
          >
            <Text
              style={[
                styles.catText,
                activeCategory === cat && styles.catTextActive,
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        )}
      />

      <View style={styles.rule} />

      {/* Feed */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={INK} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <FeedCard item={item} />}
          ListHeaderComponent={<TodayClaimCard />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={INK} />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          ItemSeparatorComponent={() => <View style={styles.rule} />}
          ListEmptyComponent={
            <Text style={styles.empty}>No articles found</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const claimStyles = StyleSheet.create({
  card: {
    margin: 12,
    marginBottom: 4,
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: INK,
    gap: 8,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    color: ACCENT,
  },
  claim: {
    fontSize: 18,
    fontFamily: 'serif',
    fontWeight: '700',
    color: INK,
    lineHeight: 24,
  },
  entity: { fontSize: 13, color: '#666', fontStyle: 'italic' },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  supportBtn: { backgroundColor: INK },
  disputeBtn: { backgroundColor: ACCENT },
  cantBtn: { borderWidth: 1.5, borderColor: INK },
  btnTextLight: { color: PAPER, fontWeight: '700', fontSize: 13 },
  btnTextDark: { color: INK, fontWeight: '700', fontSize: 13 },
  status: { fontSize: 13, color: '#444', marginTop: 8, lineHeight: 18 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPER },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'serif',
    fontWeight: '900',
    color: INK,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 10,
    color: '#888',
    letterSpacing: 1.5,
    fontWeight: '600',
    marginTop: 2,
  },
  catBar: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  catPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: RULE,
    marginRight: 4,
  },
  catPillActive: {
    backgroundColor: INK,
    borderColor: INK,
  },
  catText: { fontSize: 12, fontWeight: '600', color: '#666' },
  catTextActive: { color: PAPER },
  rule: { height: 1, backgroundColor: RULE },

  card: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  source: {
    fontSize: 11,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  category: {
    fontSize: 10,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  time: { fontSize: 10, color: '#AAA', marginLeft: 'auto' },

  cardBody: {
    flexDirection: 'row',
    gap: 12,
  },
  textCol: { flex: 1 },
  title: {
    fontSize: 16,
    fontFamily: 'serif',
    fontWeight: '700',
    color: INK,
    lineHeight: 21,
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 6,
    backgroundColor: '#E0D8CC',
  },

  tags: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  tag: {
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic',
  },

  empty: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
    fontSize: 14,
    fontStyle: 'italic',
  },
});
