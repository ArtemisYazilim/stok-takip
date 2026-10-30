import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/components/ui';
import { feedback } from '@/lib/feedback';
import { formatDateKey, formatLongDateKey, fromDateKey, toDateKey } from '@/lib/format';

/** Geçmiş vardiyalara bakarken seçilen zaman: tek gün ya da hazır aralık. */
export type ZamanSecimi =
  | { tur: 'gun'; gun: string }
  | { tur: '7g' }
  | { tur: 'ay' }
  | { tur: 'tumu' };

export function bugun(): ZamanSecimi {
  return { tur: 'gun', gun: toDateKey(new Date()) };
}

/** Seçimin başlangıç ve bitiş anı (bitiş hariç); null = sınırsız. */
export function zamanAraligi(z: ZamanSecimi): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (z.tur === 'gun') {
    const d = fromDateKey(z.gun);
    return { from: d, to: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) };
  }
  if (z.tur === '7g') {
    return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6), to: null };
  }
  if (z.tur === 'ay') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null };
  return { from: null, to: null };
}

export function zamanEtiketi(z: ZamanSecimi): string {
  if (z.tur === 'gun') return formatDateKey(z.gun);
  if (z.tur === '7g') return 'Son 7 gün';
  if (z.tur === 'ay') return 'Bu ay';
  return 'Tüm zamanlar';
}

function addDays(key: string, n: number): string {
  const d = fromDateKey(key);
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

const CHIPS: { tur: ZamanSecimi['tur']; label: string }[] = [
  { tur: 'gun', label: 'Gün' },
  { tur: '7g', label: 'Son 7 gün' },
  { tur: 'ay', label: 'Bu ay' },
  { tur: 'tumu', label: 'Tümü' },
];

export function ZamanFiltresi({
  value,
  onChange,
}: {
  value: ZamanSecimi;
  onChange: (z: ZamanSecimi) => void;
}) {
  const today = toDateKey(new Date());

  function pick(tur: ZamanSecimi['tur']) {
    feedback.press();
    if (tur === 'gun') onChange(value.tur === 'gun' ? value : { tur: 'gun', gun: today });
    else onChange({ tur });
  }

  function step(n: number) {
    if (value.tur !== 'gun') return;
    feedback.tick();
    onChange({ tur: 'gun', gun: addDays(value.gun, n) });
  }

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {CHIPS.map((c) => {
          const active = value.tur === c.tur;
          return (
            <Pressable key={c.tur} onPress={() => pick(c.tur)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {value.tur === 'gun' ? (
        <View style={styles.dayRow}>
          <Pressable onPress={() => step(-1)} hitSlop={6} style={styles.arrow}>
            <Ionicons name="chevron-back" size={18} color={colors.primary} />
          </Pressable>
          <Text style={styles.dayText} numberOfLines={1}>
            {formatLongDateKey(value.gun)}
          </Text>
          {/* Gelecek günde vardiya olmaz; ileri ok bugünde durur. */}
          <Pressable
            onPress={() => step(1)}
            disabled={value.gun >= today}
            hitSlop={6}
            style={[styles.arrow, value.gun >= today && styles.arrowDisabled]}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </Pressable>
          {value.gun !== today ? (
            <Pressable
              onPress={() => {
                feedback.press();
                onChange({ tur: 'gun', gun: today });
              }}
              hitSlop={6}
            >
              <Text style={styles.todayLink}>Bugün</Text>
            </Pressable>
          ) : (
            <Text style={styles.todayTag}>Bugün</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chipTextActive: {
    color: colors.card,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  arrowDisabled: {
    opacity: 0.35,
  },
  dayText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  todayLink: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  todayTag: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.success,
  },
});
