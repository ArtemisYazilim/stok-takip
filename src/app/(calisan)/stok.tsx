import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Badge, EmptyState, ProductThumb, Screen, colors } from '@/components/ui';
import { formatMoney, formatQty } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';

export default function WorkerStockScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('name');
    setProducts((data as Product[]) ?? []);
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
      <Text style={styles.title}>Stok Durumu</Text>
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={<EmptyState text="Ürün yok." />}
        renderItem={({ item }) => {
          const low = item.stock <= item.min_stock;
          return (
            <View style={styles.row}>
              <ProductThumb uri={item.image_url} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>Fiyat {formatMoney(item.sale_price)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={styles.rowStockLabel}>Kalan</Text>
                <Text style={[styles.rowStock, low && { color: colors.danger }]}>
                  {formatQty(item.stock)} {item.unit}
                </Text>
                {low ? <Badge text="Stok az" color={colors.danger} /> : null}
              </View>
            </View>
          );
        }}
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
    padding: 14,
    gap: 12,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  rowMeta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  rowStockLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rowStock: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
});
