import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, EmptyState, Screen, colors } from '@/components/ui';
import { formatDateTime, formatDuration, formatTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Shift } from '@/lib/types';

/** Vardiya başına sayım özeti: kaç ürün sayıldı, kaçında fark var. */
type CountSummary = { total: number; diffs: number };

export default function ShiftsScreen() {
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [summaries, setSummaries] = useState<Record<string, CountSummary>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('shifts')
      .select('*, profiles(full_name)')
      .order('started_at', { ascending: false })
      .limit(60);
    const list = (data as Shift[]) ?? [];
    setShifts(list);

    // Listelenen vardiyaların sayımlarını tek sorguda çekip fark özetini çıkar.
    const ids = list.map((s) => s.id);
    if (ids.length === 0) {
      setSummaries({});
      return;
    }
    const { data: countData } = await supabase
      .from('shift_counts')
      .select('shift_id, expected_qty, counted_qty')
      .in('shift_id', ids);
    const map: Record<string, CountSummary> = {};
    for (const c of (countData as any[]) ?? []) {
      const s = map[c.shift_id] ?? { total: 0, diffs: 0 };
      s.total += 1;
      if (c.counted_qty !== c.expected_qty) s.diffs += 1;
      map[c.shift_id] = s;
    }
    setSummaries(map);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function renderStatus(item: Shift) {
    if (!item.ended_at) return <Badge text="Açık vardiya" color={colors.success} />;
    const sum = summaries[item.id];
    if (!sum || sum.total === 0) return <Badge text="Sayım yok" color={colors.textMuted} />;
    if (sum.diffs === 0) return <Badge text="Sayım tuttu" color={colors.success} />;
    return <Badge text={`${sum.diffs} üründe fark`} color={colors.danger} />;
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Vardiyalar</Text>
        <Text style={styles.subtitle}>Bir vardiyaya dokununca satış ve sayım detayı açılır.</Text>
      </View>
      <FlatList
        data={shifts}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={<EmptyState text="Henüz vardiya kaydı yok." />}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push({ pathname: '/(admin)/vardiya-detay', params: { id: item.id } })}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.rowName}>{item.profiles?.full_name || 'Çalışan'}</Text>
              <Text style={styles.rowMeta}>{formatDateTime(item.started_at)}</Text>
              <Text style={styles.rowSub}>
                {item.ended_at
                  ? `Süre ${formatDuration(item.started_at, item.ended_at)} · bitiş ${formatTime(item.ended_at)}`
                  : `${formatDuration(item.started_at)} sürüyor`}
              </Text>
            </View>
            {renderStatus(item)}
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  rowMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  rowSub: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
