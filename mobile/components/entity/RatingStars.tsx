import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface Props {
  value: number;
  onChange: (score: number) => void;
  disabled?: boolean;
}

export function RatingStars({ value, onChange, disabled }: Props) {
  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => !disabled && onChange(star)}
          style={styles.star}
          disabled={disabled}
        >
          <Text style={[styles.starText, star <= value && styles.filled]}>
            {star <= value ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 4 },
  star: { padding: 4 },
  starText: { fontSize: 28, color: '#CCC' },
  filled: { color: '#F5A623' },
});
