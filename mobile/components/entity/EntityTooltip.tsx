/**
 * Entity tooltip — bottom sheet showing scores, ratings, and actions.
 * Port of extension/src/content/tooltip.ts
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { type EntityData } from '../../lib/evm-client';
import { shortenAddress, formatEth } from '../../lib/entity';

const INK = '#1A1A1A';
const PAPER = '#F5F0E8';

interface Props {
  data: EntityData;
  onRate?: () => void;
  onComment?: () => void;
  onTip?: () => void;
  onClose?: () => void;
}

function scoreColor(score: number): string {
  if (score >= 7000) return '#2E7D32';
  if (score >= 4000) return '#F57F17';
  if (score > 0) return '#C62828';
  return '#999';
}

export function EntityTooltip({ data, onRate, onComment, onTip, onClose }: Props) {
  const displayScore = (data.compositeScore / 100).toFixed(1);
  const displayRating = data.ratingCount > 0
    ? (data.averageRating / 100).toFixed(1)
    : 'N/A';

  const identifier = /^0x[a-fA-F0-9]{40}$/.test(data.identifier)
    ? shortenAddress(data.identifier)
    : (() => {
        try { return new URL(data.identifier).hostname; } catch { return data.identifier; }
      })();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.scoreBadge, { backgroundColor: scoreColor(data.compositeScore) }]}>
          <Text style={styles.scoreText}>{displayScore}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.identifier} numberOfLines={1}>{identifier}</Text>
          <Text style={styles.meta}>
            {'★'.repeat(Math.round(Number(displayRating) || 0))} {displayRating} ({data.ratingCount} reviews)
          </Text>
        </View>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{data.commentCount}</Text>
          <Text style={styles.statLabel}>Comments</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatEth(data.tipTotal)}</Text>
          <Text style={styles.statLabel}>Tips</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onRate}>
          <Text style={styles.actionText}>Rate</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onComment}>
          <Text style={styles.actionText}>Comment</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.tipBtn]} onPress={onTip}>
          <Text style={styles.actionText}>Tip</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  headerInfo: { flex: 1 },
  identifier: { fontSize: 16, fontWeight: '700', color: INK },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  close: { fontSize: 18, color: '#999', padding: 4 },
  stats: { flexDirection: 'row', gap: 20 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: INK },
  statLabel: { fontSize: 11, color: '#888' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    backgroundColor: INK,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  tipBtn: { backgroundColor: '#2E7D32' },
  actionText: { color: PAPER, fontWeight: '700', fontSize: 14 },
});
