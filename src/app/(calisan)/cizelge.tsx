import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PompaSayfasi } from '@/components/cizelge/pompa-sayfasi';
import { YagSatisSayfasi } from '@/components/cizelge/yag-satis-sayfasi';
import { Badge, Button, EmptyState, Screen, colors } from '@/components/ui';
import { showAlert } from '@/lib/alerts';
import { loadPrevMeters, loadSheet, saveSheet as upsertSheet } from '@/lib/cizelge-verisi';
import { feedback } from '@/lib/feedback';
import { formatDateKey, toDateKey } from '@/lib/format';
import { loadOilSheet, type OilRow, type SoldLine } from '@/lib/nobet-stok';
import { STATION_NAME } from '@/lib/pompa';
import { supabase } from '@/lib/supabase';
import type { MeterReading, Shift, ShiftSheet, ShiftSheetExtras } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

export default function CizelgeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [page, setPage] = useState<1 | 2>(1);
  const [shift, setShift] = useState<Shift | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<OilRow[]>([]);
  const [sold, setSold] = useState<SoldLine[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [sheet, setSheet] = useState<ShiftSheet | null>(null);
  const [sheetMissing, setSheetMissing] = useState(false);
  const [prevMeters, setPrevMeters] = useState<Record<string, MeterReading>>({});

  const load = useCallback(async () => {
    if (!id) return;
    const { data: shiftData } = await supabase
      .from('shifts')
      .select('*, profiles(full_name)')
      .eq('id', id)
      .maybeSingle();
    const sh = (shiftData as Shift) ?? null;
    setShift(sh);
    if (!sh) {
      setLoaded(true);
      return;
    }

    const [oil, sheetData, prev] = await Promise.all([
      loadOilSheet(sh),
      loadSheet(sh.id),
      loadPrevMeters(sh.started_at),
    ]);
    setRows(oil.rows);
    setSold(oil.sold);
    setRevenue(oil.revenue);
    setSheetMissing(sheetData.missing);
    setSheet(sheetData.sheet);
    setPrevMeters(prev);
    setLoaded(true);
  }, [id]);

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

  async function saveSheet(meters: Record<string, MeterReading>, extras: ShiftSheetExtras) {
    if (!shift || !session) return false;
    const { sheet: saved, error } = await upsertSheet(shift.id, session.user.id, meters, extras);
    if (error) {
      feedback.error();
      showAlert('Hata', error);
      return false;
    }
    feedback.success();
    setSheet(saved);
    return true;
  }

  function back() {
    feedback.press();
    router.navigate('/(calisan)/nobet');
  }

  if (!loaded) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!shift) {
    return (
      <Screen>
        <EmptyState text="Nöbet bulunamadı." />
        <View style={{ paddingHorizontal: 16 }}>
          <Button title="Tarih Seçimine Dön" variant="ghost" onPress={back} />
        </View>
      </Screen>
    );
  }

  const isOpen = !shift.ended_at;
  const isOwner = shift.profile_id === session?.user.id;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{page === 1 ? `${STATION_NAME} YAĞ SATIŞ LİSTESİ` : 'POMPA SAYAÇLARI'}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            Pompacı: {shift.profiles?.full_name || '—'} · {formatDateKey(toDateKey(shift.started_at))}
          </Text>
        </View>
        {isOpen && isOwner ? (
          <Pressable
            onPress={() => {
              feedback.press();
              router.navigate('/(calisan)/vardiya');
            }}
            style={styles.handoverBtn}
          >
            <Text style={styles.handoverText}>Devret</Text>
          </Pressable>
        ) : (
          <Badge text={isOpen ? 'Açık' : 'Kapandı'} color={isOpen ? colors.success : colors.textMuted} />
        )}
      </View>

      {/* İki sayfa da bağlı kalır: sayfa değiştirince girilen ama kaydedilmemiş
          değerler kaybolmasın. 2. sayfa, sayaçlar çoğu zaman devirden hemen önce
          okunduğu için nöbet kapandıktan sonra da sahibince düzeltilebilir. */}
      <View style={[styles.page, page !== 1 && styles.hidden]}>
        <YagSatisSayfasi
          shiftId={shift.id}
          rows={rows}
          sold={sold}
          revenue={revenue}
          editable={isOpen && isOwner}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onSaved={load}
        />
      </View>
      <View style={[styles.page, page !== 2 && styles.hidden]}>
        <PompaSayfasi
          key={sheet?.updated_at ?? 'bos'}
          sheet={sheet}
          prevMeters={prevMeters}
          oilRevenue={revenue}
          editable={isOwner}
          tableMissing={sheetMissing}
          onSave={saveSheet}
        />
      </View>

      <View style={[styles.sheetTabs, { paddingBottom: Math.max(insets.bottom, 6) }]}>
        {([1, 2] as const).map((n) => {
          const active = page === n;
          return (
            <Pressable
              key={n}
              onPress={() => {
                feedback.press();
                setPage(n);
              }}
              style={[styles.sheetTab, active && styles.sheetTabActive]}
            >
              <Text style={[styles.sheetTabText, active && styles.sheetTabTextActive]}>{n}. Sayfa</Text>
              <Text style={[styles.sheetTabSub, active && styles.sheetTabTextActive]}>
                {n === 1 ? 'Yağ Satış' : 'Pompa Sayaçları'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.danger,
    letterSpacing: 0.3,
  },
  meta: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 1,
  },
  handoverBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  handoverText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.danger,
  },
  page: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
  sheetTabs: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 6,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sheetTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  sheetTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sheetTabText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  sheetTabSub: {
    fontSize: 11,
    color: colors.textMuted,
  },
  sheetTabTextActive: {
    color: '#fff',
  },
});
