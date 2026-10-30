import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { StokTablosu } from '@/components/stok-tablosu';
import { Screen, colors } from '@/components/ui';
import { UrunIslemPenceresi } from '@/components/urun-islem-penceresi';
import { showAlert } from '@/lib/alerts';
import { feedback } from '@/lib/feedback';
import { formatDateKey, formatMoney, toDateKey } from '@/lib/format';
import { liveOilRows, loadOilSheet, loadProducts, type OilRow } from '@/lib/nobet-stok';
import { supabase } from '@/lib/supabase';
import type { Shift } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

export default function WorkerStockScreen() {
  const { session } = useAuth();
  const [shift, setShift] = useState<Shift | null>(null);
  const [rows, setRows] = useState<OilRow[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [selected, setSelected] = useState<OilRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('profile_id', session.user.id)
      .is('ended_at', null)
      .maybeSingle();
    const open = (data as Shift) ?? null;
    // Sütunlar kendi açık nöbetine göre; nöbet yoksa sadece raftaki stok.
    if (open) {
      const oil = await loadOilSheet(open);
      setRows(oil.rows);
      setRevenue(oil.revenue);
    } else {
      setRows(liveOilRows(await loadProducts()));
      setRevenue(0);
    }
    setShift(open);
  }, [session]);

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

  function openRow(row: OilRow) {
    if (!shift) {
      feedback.warning();
      showAlert('Nöbet yok', 'Satış için önce Nöbet sekmesinden nöbetinizi başlatın.');
      return;
    }
    feedback.press();
    setSelected(row);
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Stok</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {shift
            ? `Nöbet ${formatDateKey(toDateKey(shift.started_at))} · satış ${formatMoney(revenue)}`
            : 'Açık nöbet yok · satış için nöbet başlatın'}
        </Text>
      </View>

      <StokTablosu
        rows={rows}
        onPressRow={openRow}
        refreshing={refreshing}
        onRefresh={onRefresh}
        emptyText="Ürün yok. Admin ürün eklemeli."
        footer={<Text style={styles.legend}>Satış, ÇKN veya iade için ürüne dokunun.</Text>}
      />

      {shift ? (
        <UrunIslemPenceresi
          row={selected}
          shiftId={shift.id}
          onClose={() => setSelected(null)}
          onSaved={load}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  legend: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
    paddingHorizontal: 4,
  },
});
