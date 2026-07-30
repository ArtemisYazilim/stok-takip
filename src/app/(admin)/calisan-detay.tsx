import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, EmptyState, Screen, SectionTitle, colors } from '@/components/ui';
import { formatDateTime, formatMoney, formatQty } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Profile, Shift, StockMovement } from '@/lib/types';

interface ShiftRow {
  shift: Shift;
  qty: number;
  revenue: number;
  hours: number | null;
}

export default function EmployeeDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [profileRes, shiftsRes, movRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase.from('shifts').select('*').eq('profile_id', id).order('started_at', { ascending: false }),
      supabase.from('stock_movements').select('*').eq('profile_id', id).eq('type', 'satis'),
    ]);
    setProfile((profileRes.data as Profile) ?? null);

    const movements = (movRes.data as StockMovement[]) ?? [];
    const byShift = new Map<string, { qty: number; revenue: number }>();
    for (const m of movements) {
      if (!m.shift_id) continue;
      const existing = byShift.get(m.shift_id) ?? { qty: 0, revenue: 0 };
      existing.qty += m.qty;
      existing.revenue += m.qty * (m.unit_price ?? 0);
      byShift.set(m.shift_id, existing);
    }

    const shifts = (shiftsRes.data as Shift[]) ?? [];
    setRows(
      shifts.map((shift) => {
        const agg = byShift.get(shift.id) ?? { qty: 0, revenue: 0 };
        const hours = shift.ended_at
          ? (new Date(shift.ended_at).getTime() - new Date(shift.started_at).getTime()) / 3_600_000
          : null;
        return { shift, qty: agg.qty, revenue: agg.revenue, hours };
      }),
    );
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalHours = rows.reduce((s, r) => s + (r.hours ?? 0), 0);

  async function runDelete() {
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_delete_employee', { target_id: profile.id });
    setBusy(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    router.back();
  }

  function handleDelete() {
    if (!profile) return;
    const message = `${profile.full_name || 'Bu çalışan'} kalıcı olarak silinecek. Vardiya ve satış geçmişi de silinir. Emin misiniz?`;
    // Web'de Alert.alert buton onPress'i tetiklemez; window.confirm kullan.
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) {
        runDelete();
      }
      return;
    }
    Alert.alert('Çalışanı sil', message, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: runDelete },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>Çalışan Detayı</Text>

        {profile ? (
          <Card style={{ gap: 6 }}>
            <View style={styles.headerRow}>
              <Text style={styles.worker}>{profile.full_name || '(İsimsiz)'}</Text>
              <Badge
                text={profile.active ? 'Aktif' : 'Pasif'}
                color={profile.active ? colors.success : colors.textMuted}
              />
            </View>
            <Text style={styles.meta}>Katılım: {formatDateTime(profile.created_at)}</Text>
          </Card>
        ) : null}

        <Card style={{ gap: 10 }}>
          <SectionTitle text="Özet" />
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{formatMoney(totalRevenue)}</Text>
              <Text style={styles.summaryLabel}>Toplam satış</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{formatQty(totalQty)}</Text>
              <Text style={styles.summaryLabel}>Satılan adet</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{formatQty(totalHours)} sa</Text>
              <Text style={styles.summaryLabel}>Toplam süre</Text>
            </View>
          </View>
        </Card>

        <Card style={{ gap: 10 }}>
          <SectionTitle text={`Vardiyalar (${rows.length})`} />
          {rows.length === 0 ? (
            <EmptyState text="Vardiya kaydı yok." />
          ) : (
            rows.map(({ shift, qty, revenue, hours }) => (
              <Pressable
                key={shift.id}
                style={styles.shiftRow}
                onPress={() => router.push({ pathname: '/(admin)/vardiya-detay', params: { id: shift.id } })}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.shiftDate}>
                    {formatDateTime(shift.started_at)}
                    {shift.ended_at ? ` → ${formatDateTime(shift.ended_at)}` : ''}
                  </Text>
                  <Text style={styles.meta}>
                    {formatMoney(revenue)} · {formatQty(qty)} adet
                    {hours !== null ? ` · ${formatQty(hours)} sa` : ''}
                  </Text>
                </View>
                {shift.ended_at ? (
                  <Badge text="Kapalı" color={colors.textMuted} />
                ) : (
                  <Badge text="Açık" color={colors.success} />
                )}
              </Pressable>
            ))
          )}
        </Card>

        {profile && profile.role !== 'admin' ? (
          <Button title="Çalışanı Sil" variant="danger" onPress={handleDelete} loading={busy} />
        ) : null}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryItem: {
    flex: 1,
    gap: 2,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  shiftDate: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
