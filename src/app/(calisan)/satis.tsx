import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, Screen, colors } from '@/components/ui';
import { formatMoney, formatQty } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useOpenShift } from '@/hooks/use-open-shift';

export default function SaleScreen() {
  const router = useRouter();
  const { session, profile, signOut } = useAuth();
  const { shift, loaded, reload } = useOpenShift();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
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
      reload();
    }, [load, reload]),
  );

  function changeQty(productId: string, delta: number, max: number) {
    setCart((prev) => {
      const next = Math.max(0, Math.min(max, (prev[productId] ?? 0) + delta));
      const copy = { ...prev };
      if (next === 0) delete copy[productId];
      else copy[productId] = next;
      return copy;
    });
  }

  const cartItems = products.filter((p) => cart[p.id]);
  const total = cartItems.reduce((sum, p) => sum + (cart[p.id] ?? 0) * p.sale_price, 0);

  async function handleSell() {
    if (!session || !shift || cartItems.length === 0) return;
    setBusy(true);
    const rows = cartItems.map((p) => ({
      product_id: p.id,
      profile_id: session.user.id,
      shift_id: shift.id,
      type: 'satis' as const,
      qty: cart[p.id],
      unit_price: p.sale_price,
    }));
    const { error } = await supabase.from('stock_movements').insert(rows);
    setBusy(false);
    if (error) {
      Alert.alert('Hata', error.message.includes('Yetersiz stok') ? 'Yetersiz stok!' : error.message);
      await load();
      return;
    }
    Alert.alert('Tamam', `Satış kaydedildi: ${formatMoney(total)}`);
    setCart({});
    await load();
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([load(), reload()]);
    setRefreshing(false);
  }

  if (loaded && !shift) {
    return (
      <Screen>
        <View style={styles.header}>
          <Text style={styles.title}>Satış</Text>
          <Pressable onPress={signOut} hitSlop={8}>
            <Ionicons name="log-out-outline" size={24} color={colors.textMuted} />
          </Pressable>
        </View>
        <View style={styles.noShift}>
          <Card style={{ gap: 12, alignItems: 'center', padding: 24 }}>
            <Ionicons name="time-outline" size={40} color={colors.textMuted} />
            <Text style={styles.noShiftText}>
              Satış yapabilmek için önce vardiyanızı başlatın.
            </Text>
            <Button
              title="Vardiyaya Git"
              onPress={() => router.push('/(calisan)/vardiya')}
            />
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Satış</Text>
          <Text style={styles.subtitle}>{profile?.full_name}</Text>
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
        ListEmptyComponent={<EmptyState text="Satılacak ürün yok. Admin ürün eklemeli." />}
        renderItem={({ item }) => {
          const qty = cart[item.id] ?? 0;
          const out = item.stock <= 0;
          return (
            <View style={[styles.row, out && { opacity: 0.5 }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {formatMoney(item.sale_price)} · stok {formatQty(item.stock)} {item.unit}
                </Text>
              </View>
              <View style={styles.stepper}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => changeQty(item.id, -1, item.stock)}
                  disabled={qty === 0}
                >
                  <Ionicons name="remove" size={20} color={qty === 0 ? colors.border : colors.primary} />
                </Pressable>
                <Text style={styles.stepQty}>{qty}</Text>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => changeQty(item.id, 1, item.stock)}
                  disabled={out || qty >= item.stock}
                >
                  <Ionicons
                    name="add"
                    size={20}
                    color={out || qty >= item.stock ? colors.border : colors.primary}
                  />
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      {cartItems.length > 0 ? (
        <View style={styles.footer}>
          <Button
            title={`Satışı Kaydet · ${formatMoney(total)}`}
            variant="success"
            onPress={handleSell}
            loading={busy}
          />
        </View>
      ) : null}
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
    padding: 12,
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
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  stepQty: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  noShift: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  noShiftText: {
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
  },
});
