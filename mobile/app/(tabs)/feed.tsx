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
import { Ionicons } from '@expo/vector-icons';

const INK = '#1A1A1A';
const PAPER = '#F5F0E8';
const RULE = '#D4C9B8';
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

function StarRating({ onRate }: { onRate: (n: number) => void }) {
  const [selected, setSelected] = useState(0);
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          onPress={() => { setSelected(n); onRate(n); }}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        >
          <Ionicons
            name={n <= selected ? 'star' : 'star-outline'}
            size={18}
            color={n <= selected ? '#D4A017' : '#999'}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

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

      {/* Actions */}
      <View style={styles.actions}>
        <StarRating onRate={(n) => {
          // TODO: call pooter SDK rate()
          console.log(`Rated ${item.id}: ${n} stars`);
        }} />

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              // TODO: open comment sheet
              console.log(`Comment on ${item.id}`);
            }}
          >
            <Ionicons name="chatbubble-outline" size={16} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tipBtn}
            onPress={() => {
              // TODO: call pooter SDK tipEntity()
              console.log(`Tip ${item.id}`);
            }}
          >
            <Ionicons name="gift-outline" size={14} color={PAPER} />
            <Text style={styles.tipText}>Tip</Text>
          </TouchableOpacity>
        </View>
      </View>
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

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  stars: { flexDirection: 'row', gap: 4 },
  actionButtons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionBtn: { padding: 4 },
  tipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: INK,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  tipText: { color: PAPER, fontSize: 12, fontWeight: '700' },

  empty: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
    fontSize: 14,
    fontStyle: 'italic',
  },
});
