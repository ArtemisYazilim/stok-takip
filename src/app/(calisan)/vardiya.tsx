import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, Input, Screen, colors } from '@/components/ui';
import { showAlert } from '@/lib/alerts';
import { feedback } from '@/lib/feedback';
import { formatDateTime, formatDuration, parseNumberInput } from '@/lib/format';
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
      feedback.error();
      showAlert('Hata', error.message);
      return;
    }
    feedback.success();
    await reload();
  }

  function beginCounting() {
    // Sayım alanları boş başlar; çalışan her ürünü gerçekten sayıp girmeden kapatılamaz.
    setCounts({});
    setCounting(true);
  }

  async function finishShift() {
    if (!shift) return;
    for (const p of products) {
      if (parseNumberInput(counts[p.id] ?? '') === null) {
        feedback.error();
        showAlert('Hata', `"${p.name}" için geçerli bir sayım girin.`);
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
      feedback.error();
      showAlert('Hata', countError.message);
      return;
    }

    const { error: endError } = await supabase
      .from('shifts')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', shift.id);
    setBusy(false);
    if (endError) {
      feedback.error();
      showAlert('Hata', endError.message);
      return;
    }

    const diffs = rows.filter((r) => r.counted_qty !== r.expected_qty);
    if (diffs.length === 0) feedback.success();
    else feedback.warning();
    showAlert(
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
    // Admin bu çalışana vardiya açma izni vermediyse başlatma butonu gösterilmez;
    // vardiyayı admin, Vardiyalar sekmesinden çalışan adına açar.
    const canOpen = profile?.can_open_shift ?? true;
    return (
      <Screen>
        <Text style={styles.title}>Vardiya</Text>
        <View style={styles.center}>
          <Card style={{ gap: 14, alignItems: 'center', padding: 24 }}>
            <Text style={styles.bigText}>Vardiyanız kapalı</Text>
            {canOpen ? (
              <>
                <Text style={styles.hint}>
                  Nöbeti devralınca vardiyayı başlatın. Yaptığınız tüm satışlar bu vardiyaya işlenir.
                </Text>
                <Button title="Vardiyayı Başlat" onPress={startShift} loading={busy} />
              </>
            ) : (
              <>
                <Text style={styles.hint}>
                  Vardiya açma yetkiniz yok. Admin sizin için vardiya başlattığında burada görünür.
                </Text>
                <Button title="Yenile" variant="ghost" onPress={reload} loading={!loaded} />
              </>
            )}
          </Card>
        </View>
      </Screen>
    );
  }

  if (counting) {
    return (
      <Screen>
        <View style={styles.stepHead}>
          <Text style={styles.stepTag}>Adım 2 / 2 · Stok Sayımı</Text>
          <Text style={styles.stepTitle}>Rafı say</Text>
          <Text style={styles.hint}>
            Her ürünün rafta gerçekte kaç tane olduğunu say ve karşısına yaz. Sistemdeki sayıyla
            farklıysa kayda geçer, sonra vardiya kapanır.
          </Text>
        </View>
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={styles.countRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.hint}>rafta gerçekte kaç tane var, say ve yaz</Text>
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
              <Button title="Sayımı Bitir ve Vardiyayı Kapat" variant="danger" onPress={finishShift} loading={busy} />
              <Button title="Geri Dön" variant="ghost" onPress={() => setCounting(false)} />
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
        <Card style={{ gap: 12, padding: 20 }}>
          <View style={styles.openRow}>
            <Badge text="Vardiya açık" color={colors.success} />
            <Text style={styles.elapsed}>{formatDuration(shift.started_at)}</Text>
          </View>
          <Text style={styles.bigText}>{profile?.full_name ?? ''}</Text>
          <Text style={styles.hint}>Başlangıç: {formatDateTime(shift.started_at)}</Text>
          <View style={styles.divider} />
          <Text style={styles.hint}>
            Vardiyan bitince aşağıdaki butona bas. Önce stok sayımı yapacaksın (Adım 2/2), sonra
            vardiya kapanır. Fark çıkarsa admin panelinde görünür.
          </Text>
          <Button title="Vardiyayı Kapat →" variant="danger" onPress={beginCounting} />
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
  openRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  elapsed: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.success,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  stepHead: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 6,
  },
  stepTag: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
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
