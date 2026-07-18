import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Input, Screen, SectionTitle, colors } from '@/components/ui';
import { formatDateTime, formatQty, parseNumberInput } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useOpenShift } from '@/hooks/use-open-shift';

export default function ShiftScreen() {
  const { session, profile } = useAuth();
  const { shift, loaded, reload } = useOpenShift();
  const [products, setProducts] = useState<Product[]>([]);
  const [counting, setCounting] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const loadProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('name');
    setProducts((data as Product[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
      loadProducts();
    }, [reload, loadProducts]),
  );

  async function startShift() {
    if (!session) return;
    setBusy(true);
    const { error } = await supabase.from('shifts').insert({ profile_id: session.user.id });
    setBusy(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    await reload();
  }

  function beginCounting() {
    // Sayım alanlarını mevcut sistem stokuyla doldur; çalışan gerçek sayıma göre düzeltir.
    const initial: Record<string, string> = {};
    for (const p of products) initial[p.id] = String(p.stock);
    setCounts(initial);
    setCounting(true);
  }

  async function finishShift() {
    if (!shift) return;
    for (const p of products) {
      if (parseNumberInput(counts[p.id] ?? '') === null) {
        Alert.alert('Hata', `"${p.name}" için geçerli bir sayım girin.`);
        return;
      }
    }
    setBusy(true);

    // Sayım anındaki güncel stok "beklenen" olarak kaydedilir.
    const { data: fresh } = await supabase
      .from('products')
      .select('id, stock')
      .eq('active', true);
    const freshStock = new Map((fresh ?? []).map((p: any) => [p.id as string, p.stock as number]));

    const rows = products.map((p) => ({
      shift_id: shift.id,
      product_id: p.id,
      expected_qty: freshStock.get(p.id) ?? p.stock,
      counted_qty: parseNumberInput(counts[p.id] ?? '')!,
    }));

    const { error: countError } = await supabase.from('shift_counts').insert(rows);
    if (countError) {
      setBusy(false);
      Alert.alert('Hata', countError.message);
      return;
    }

    const { error: endError } = await supabase
      .from('shifts')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', shift.id);
    setBusy(false);
    if (endError) {
      Alert.alert('Hata', endError.message);
      return;
    }

    const diffs = rows.filter((r) => r.counted_qty !== r.expected_qty);
    Alert.alert(
      'Vardiya kapatıldı',
      diffs.length === 0
        ? 'Sayım sistemle birebir tuttu. İyi günler!'
        : `${diffs.length} üründe fark çıktı, admin panelinde görünecek.`,
    );
    setCounting(false);
    setCounts({});
    await reload();
  }

  if (!loaded) return <Screen><View /></Screen>;

  if (!shift) {
    return (
      <Screen>
        <Text style={styles.title}>Vardiya</Text>
        <View style={styles.center}>
          <Card style={{ gap: 14, alignItems: 'center', padding: 24 }}>
            <Text style={styles.bigText}>Vardiyanız kapalı</Text>
            <Text style={styles.hint}>
              Nöbeti devralınca vardiyayı başlatın. Yaptığınız tüm satışlar bu vardiyaya işlenir.
            </Text>
            <Button title="Vardiyayı Başlat" onPress={startShift} loading={busy} />
          </Card>
        </View>
      </Screen>
    );
  }

  if (counting) {
    return (
      <Screen>
        <Text style={styles.title}>Devir Sayımı</Text>
        <Text style={styles.hintPad}>
          Rafta gerçekte kaç {'"'}adet{'"'} olduğunu sayıp yazın. Sistem stokuyla fark varsa kayda geçer.
        </Text>
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={styles.countRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.hint}>
                  sistemde: {formatQty(item.stock)} {item.unit}
                </Text>
              </View>
              <Input
                value={counts[item.id] ?? ''}
                onChangeText={(t) => setCounts((prev) => ({ ...prev, [item.id]: t }))}
                keyboardType="decimal-pad"
                style={styles.countInput}
              />
            </View>
          )}
          ListFooterComponent={
            <View style={{ gap: 10, marginTop: 10 }}>
              <Button title="Sayımı Onayla ve Vardiyayı Kapat" variant="danger" onPress={finishShift} loading={busy} />
              <Button title="Vazgeç" variant="ghost" onPress={() => setCounting(false)} />
            </View>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Vardiya</Text>
      <View style={styles.center}>
        <Card style={{ gap: 14, padding: 20 }}>
          <SectionTitle text={`Açık vardiya · ${profile?.full_name ?? ''}`} />
          <Text style={styles.hint}>Başlangıç: {formatDateTime(shift.started_at)}</Text>
          <Text style={styles.hint}>
            Vardiyayı kapatmadan önce stok sayımı yapılır. Fark çıkarsa admin panelinde görünür.
          </Text>
          <Button title="Vardiyayı Bitir (Sayıma Geç)" variant="danger" onPress={beginCounting} />
        </Card>
      </View>
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
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  bigText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  hintPad: {
    fontSize: 13,
    color: colors.textMuted,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 8,
  },
  countRow: {
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
  countInput: {
    width: 90,
    textAlign: 'center',
  },
});
