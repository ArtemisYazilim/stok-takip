import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, EmptyState, Screen, SectionTitle, colors } from '@/components/ui';
import { formatDateTime, formatMoney, formatQty } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Shift, ShiftCount, StockMovement } from '@/lib/types';

interface SaleSummary {
  name: string;
  unit: string;
  qty: number;
  revenue: number;
}

export default function ShiftDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [shift, setShift] = useState<Shift | null>(null);
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [counts, setCounts] = useState<ShiftCount[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    const [shiftRes, movRes, countRes] = await Promise.all([
      supabase.from('shifts').select('*, profiles(full_name)').eq('id', id).single(),
      supabase
        .from('stock_movements')
        .select('*, products(name, unit)')
        .eq('shift_id', id)
        .eq('type', 'satis'),
      supabase.from('shift_counts').select('*, products(name, unit)').eq('shift_id', id),
    ]);
    setShift((shiftRes.data as Shift) ?? null);
    setCounts((countRes.data as ShiftCount[]) ?? []);

    const byProduct = new Map<string, SaleSummary>();
    for (const m of (movRes.data as StockMovement[]) ?? []) {
      const key = m.product_id;
      const existing = byProduct.get(key) ?? {
        name: m.products?.name ?? 'Ürün',
        unit: m.products?.unit ?? '',
        qty: 0,
        revenue: 0,
      };
      existing.qty += m.qty;
      existing.revenue += m.qty * (m.unit_price ?? 0);
      byProduct.set(key, existing);
    }
    setSales([...byProduct.values()].sort((a, b) => b.revenue - a.revenue));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const totalRevenue = sales.reduce((s, x) => s + x.revenue, 0);
  const diffs = counts.filter((c) => c.counted_qty !== c.expected_qty);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>Vardiya Detayı</Text>

        {shift ? (
          <Card style={{ gap: 6 }}>
            <Text style={styles.worker}>{shift.profiles?.full_name || 'Çalışan'}</Text>
            <Text style={styles.meta}>Başlangıç: {formatDateTime(shift.started_at)}</Text>
            <Text style={styles.meta}>
              Bitiş: {shift.ended_at ? formatDateTime(shift.ended_at) : 'Devam ediyor'}
            </Text>
          </Card>
        ) : null}

        <Card style={{ gap: 10 }}>
          <SectionTitle text={`Satışlar · ${formatMoney(totalRevenue)}`} />
          {sales.length === 0 ? (
            <EmptyState text="Bu vardiyada satış yok." />
          ) : (
            sales.map((s) => (
              <View key={s.name} style={styles.saleRow}>
                <Text style={styles.saleName}>{s.name}</Text>
                <Text style={styles.saleQty}>
                  {formatQty(s.qty)} {s.unit} · {formatMoney(s.revenue)}
                </Text>
              </View>
            ))
          )}
        </Card>

        <Card style={{ gap: 10 }}>
          <View style={styles.countHeader}>
            <SectionTitle text="Devir Sayımı" />
            {counts.length > 0 &&
              (diffs.length === 0 ? (
                <Badge text="Sayım tuttu" color={colors.success} />
              ) : (
                <Badge text={`${diffs.length} üründe fark`} color={colors.danger} />
              ))}
          </View>
          {counts.length === 0 ? (
            <EmptyState text="Sayım kaydı yok (vardiya açık olabilir)." />
          ) : (
            counts.map((c) => {
              const diff = c.counted_qty - c.expected_qty;
              return (
                <View key={c.id} style={styles.saleRow}>
                  <Text style={styles.saleName}>{c.products?.name ?? 'Ürün'}</Text>
                  <Text
                    style={[
                      styles.saleQty,
                      diff !== 0 && { color: colors.danger, fontWeight: '700' },
                    ]}
                  >
                    beklenen {formatQty(c.expected_qty)} / sayılan {formatQty(c.counted_qty)}
                    {diff !== 0 ? ` (${diff > 0 ? '+' : ''}${formatQty(diff)})` : ''}
                  </Text>
                </View>
              );
            })
          )}
        </Card>

        <Button title="Geri" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 16,
    gap: 14,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  worker: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  countHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  saleName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  saleQty: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
