import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Badge, EmptyState, Screen, colors } from '@/components/ui';
import { formatDateTime, formatQty } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { MOVEMENT_LABELS, type StockMovement } from '@/lib/types';

const TYPE_COLORS: Record<string, string> = {
  satis: colors.primary,
  alim: colors.success,
  duzeltme: colors.warning,
  iade: colors.textMuted,
};

export default function MovementsScreen() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('stock_movements')
      .select('*, products(name, unit), profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(150);
    setMovements((data as StockMovement[]) ?? []);
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

  return (
    <Screen>
      <Text style={styles.title}>Hareketler</Text>
      <FlatList
        data={movements}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={<EmptyState text="Henüz stok hareketi yok." />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.rowName}>{item.products?.name ?? 'Ürün'}</Text>
              <Text style={styles.rowMeta}>
                {item.profiles?.full_name || 'Bilinmiyor'} · {formatDateTime(item.created_at)}
              </Text>
              {item.note ? <Text style={styles.rowNote}>{item.note}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text
                style={[
                  styles.rowDelta,
                  { color: item.delta < 0 ? colors.danger : colors.success },
                ]}
              >
                {item.delta > 0 ? '+' : ''}
                {formatQty(item.delta)} {item.products?.unit ?? ''}
              </Text>
              <Badge
                text={MOVEMENT_LABELS[item.type] ?? item.type}
                color={TYPE_COLORS[item.type] ?? colors.textMuted}
              />
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
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
    padding: 13,
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
  rowNote: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  rowDelta: {
    fontSize: 15,
    fontWeight: '700',
  },
});
