import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, EmptyState, ProductThumb, Screen, colors } from '@/components/ui';
import { formatMoney, formatQty } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

export default function AdminStockScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
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

  // Değer raf + depo toplamıdır: depodaki ürün de işletmenin malıdır.
  const totalValue = products.reduce(
    (sum, p) => sum + (p.stock + p.depot_stock) * p.sale_price,
    0,
  );

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Stok</Text>
          <Text style={styles.subtitle}>
            {products.length} ürün · toplam değer {formatMoney(totalValue)}
          </Text>
        </View>
        <Pressable onPress={signOut} hitSlop={8}>
          <Ionicons name="log-out-outline" size={24} color={colors.textMuted} />
        </Pressable>
      </View>

      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={<EmptyState text="Henüz ürün yok. Sağ alttan ekleyin." />}
        renderItem={({ item }) => {
          const low = item.stock <= item.min_stock;
          return (
            <Pressable
              style={styles.row}
              onPress={() => router.push({ pathname: '/(admin)/urun', params: { id: item.id } })}
            >
              <ProductThumb uri={item.image_url} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowPrice}>Fiyat {formatMoney(item.sale_price)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={styles.rowStockLabel}>Raf</Text>
                <Text style={[styles.rowStock, low && { color: colors.danger }]}>
                  {formatQty(item.stock)}
                </Text>
                <Text style={styles.rowDepot}>depo {formatQty(item.depot_stock)}</Text>
                {low ? <Badge text="Stok az" color={colors.danger} /> : null}
              </View>
            </Pressable>
          );
        }}
      />

      <View style={styles.fabWrap}>
        <Button
          title="Excel'den Aktar"
          icon="document-text-outline"
          variant="ghost"
          onPress={() => router.push('/(admin)/aktar')}
          style={styles.importBtn}
        />
        <Button title="+ Yeni Ürün" onPress={() => router.push('/(admin)/urun')} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 90,
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
  rowPrice: {
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
  rowDepot: {
    fontSize: 12,
    color: colors.textMuted,
  },
  fabWrap: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    left: 16,
    flexDirection: 'row',
    gap: 8,
  },
  importBtn: {
    flex: 1,
    backgroundColor: colors.card,
  },
});
