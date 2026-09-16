import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, ProductThumb, Screen, colors } from '@/components/ui';
import { showAlert } from '@/lib/alerts';
import { feedback } from '@/lib/feedback';
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
  // satis = raftan düşer; iade = müşteri geri getirir, stoğa eklenir.
  const [mode, setMode] = useState<'satis' | 'iade'>('satis');
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

  async function handleSave() {
    if (!session || !shift || cartItems.length === 0) return;
    setBusy(true);
    const rows = cartItems.map((p) => ({
      product_id: p.id,
      profile_id: session.user.id,
      shift_id: shift.id,
      type: mode,
      qty: cart[p.id],
      unit_price: p.sale_price,
    }));
    const { error } = await supabase.from('stock_movements').insert(rows);
    setBusy(false);
    if (error) {
      feedback.error();
      showAlert('Hata', error.message.includes('Yetersiz stok') ? 'Yetersiz stok!' : error.message);
      await load();
      return;
    }
    if (mode === 'satis') {
      feedback.sale();
      showAlert('Tamam', `Satış kaydedildi: ${formatMoney(total)}`);
    } else {
      feedback.success();
      showAlert('Tamam', `İade kaydedildi, stok güncellendi: ${formatMoney(total)}`);
    }
    setCart({});
    await load();
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([load(), reload()]);
    setRefreshing(false);
  }

  if (loaded && !shift) {
    const canOpen = profile?.can_open_shift ?? true;
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
              {canOpen
                ? 'Satış yapabilmek için önce vardiyanızı başlatın.'
                : 'Vardiya açma yetkiniz yok. Admin sizin için vardiya başlattığında satış yapabilirsiniz.'}
            </Text>
            {canOpen ? (
              <Button
                title="Vardiyaya Git"
                onPress={() => router.push('/(calisan)/vardiya')}
              />
            ) : (
              <Button title="Yenile" variant="ghost" onPress={reload} />
            )}
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

      <View style={styles.modeRow}>
        {(['satis', 'iade'] as const).map((m) => {
          const active = mode === m;
          return (
            <Pressable
              key={m}
              style={[styles.modeBtn, active && styles.modeBtnActive]}
              onPress={() => {
                feedback.press();
                setMode(m);
                setCart({});
              }}
            >
              <Text style={[styles.modeText, active && styles.modeTextActive]}>
                {m === 'satis' ? 'Satış' : 'İade Al'}
              </Text>
            </Pressable>
          );
        })}
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
          // İadede ürün müşteriden gelir; stok sınırı ve "tükendi" kilidi uygulanmaz.
          const out = mode === 'satis' && item.stock <= 0;
          const max = mode === 'satis' ? item.stock : 9999;
          return (
            <View style={[styles.row, out && { opacity: 0.5 }]}>
              <ProductThumb uri={item.image_url} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {formatMoney(item.sale_price)} · stok {formatQty(item.stock)}
                </Text>
              </View>
              <View style={styles.stepper}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => {
                    feedback.press();
                    changeQty(item.id, -1, max);
                  }}
                  disabled={qty === 0}
                >
                  <Ionicons name="remove" size={20} color={qty === 0 ? colors.border : colors.primary} />
                </Pressable>
                <Text style={styles.stepQty}>{qty}</Text>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => {
                    feedback.tick();
                    changeQty(item.id, 1, max);
                  }}
                  disabled={out || qty >= max}
                >
                  <Ionicons
                    name="add"
                    size={20}
                    color={out || qty >= max ? colors.border : colors.primary}
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
            title={
              mode === 'satis'
                ? `Satışı Kaydet · ${formatMoney(total)}`
                : `İadeyi Kaydet · ${formatMoney(total)}`
            }
            variant="success"
            onPress={handleSave}
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
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
  },
  modeTextActive: {
    color: '#fff',
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
