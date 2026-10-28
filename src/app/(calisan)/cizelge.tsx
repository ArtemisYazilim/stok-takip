import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PompaSayfasi } from '@/components/cizelge/pompa-sayfasi';
import { round2, YagSatisSayfasi, type OilRow, type SoldLine } from '@/components/cizelge/yag-satis-sayfasi';
import { Badge, Button, EmptyState, Screen, colors } from '@/components/ui';
import { showAlert } from '@/lib/alerts';
import { feedback } from '@/lib/feedback';
import { formatDateKey, toDateKey } from '@/lib/format';
import { STATION_NAME } from '@/lib/pompa';
import { supabase } from '@/lib/supabase';
import type { MeterReading, Product, Shift, ShiftSheet, ShiftSheetExtras } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

interface MovementLite {
  product_id: string;
  shift_id: string | null;
  type: string;
  qty: number;
  delta: number;
  unit_price: number | null;
  products?: { name: string } | null;
}

function sumByProduct(rows: { product_id: string; delta: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.product_id, (map.get(r.product_id) ?? 0) + Number(r.delta));
  return map;
}

/** PostgREST "tablo yok" hataları: 005 geçişi henüz çalıştırılmamış demektir. */
function isMissingTable(code?: string) {
  return code === 'PGRST205' || code === '42P01';
}

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

    // Nöbet penceresindeki tüm hareketler (herkesin): nöbet başındaki stok
    // (önceki BAK) için pencere içindeki her stok değişimi geri alınır.
    let movQuery = supabase
      .from('stock_movements')
      .select('product_id, shift_id, type, qty, delta, unit_price, products(name)')
      .gte('created_at', sh.started_at);
    if (sh.ended_at) movQuery = movQuery.lte('created_at', sh.ended_at);

    const [prodRes, movRes, sheetRes, prevRes] = await Promise.all([
      supabase.from('products').select('*').eq('active', true).order('name'),
      movQuery,
      supabase.from('shift_sheets').select('*').eq('shift_id', sh.id).maybeSingle(),
      supabase
        .from('shifts')
        .select('id')
        .lt('started_at', sh.started_at)
        .order('started_at', { ascending: false })
        .limit(10),
    ]);
    const products = (prodRes.data as Product[]) ?? [];
    const movements = (movRes.data as unknown as MovementLite[]) ?? [];

    // Kapanmış nöbette BAK = kapanıştaki stok. Devir sayımı yapıldıysa sayım
    // anındaki beklenen stok kullanılır; admin sayımsız kapattıysa bugünkü
    // stoktan kapanıştan sonraki hareketler geri alınır.
    let endStock: Map<string, number> | null = null;
    if (sh.ended_at) {
      const { data: counts } = await supabase
        .from('shift_counts')
        .select('product_id, expected_qty')
        .eq('shift_id', sh.id);
      if (counts && counts.length > 0) {
        endStock = new Map(counts.map((c) => [c.product_id as string, Number(c.expected_qty)]));
      } else {
        const { data: after } = await supabase
          .from('stock_movements')
          .select('product_id, delta')
          .gt('created_at', sh.ended_at);
        const afterSum = sumByProduct(after ?? []);
        endStock = new Map(products.map((p) => [p.id, p.stock - (afterSum.get(p.id) ?? 0)]));
      }
    }

    const windowSum = sumByProduct(movements);
    // ÇKN: pencerede rafa giren ürün. Pompacının depodan çıkışı da adminin
    // alımı da kağıtta aynı sütuna yazılır.
    const cknMap = sumByProduct(
      movements.filter((m) => m.type === 'cikis' || m.type === 'alim'),
    );
    const soldMap = new Map<string, SoldLine>();
    let total = 0;
    for (const m of movements) {
      if (m.shift_id !== sh.id || (m.type !== 'satis' && m.type !== 'iade')) continue;
      const sign = m.type === 'satis' ? 1 : -1;
      const line = soldMap.get(m.product_id) ?? {
        productId: m.product_id,
        name: m.products?.name ?? 'Ürün',
        qty: 0,
        revenue: 0,
      };
      line.qty += sign * Number(m.qty);
      line.revenue += sign * Number(m.qty) * Number(m.unit_price ?? 0);
      total += sign * Number(m.qty) * Number(m.unit_price ?? 0);
      soldMap.set(m.product_id, line);
    }

    setRows(
      products.map((p) => {
        const kalan = endStock ? (endStock.get(p.id) ?? p.stock) : p.stock;
        return {
          product: p,
          kalan: round2(kalan),
          onceki: round2(kalan - (windowSum.get(p.id) ?? 0)),
          ckn: round2(cknMap.get(p.id) ?? 0),
          satilan: round2(soldMap.get(p.id)?.qty ?? 0),
        };
      }),
    );
    setSold(
      [...soldMap.values()]
        .filter((l) => round2(l.qty) !== 0)
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    );
    setRevenue(round2(total));

    if (sheetRes.error && isMissingTable(sheetRes.error.code)) {
      setSheetMissing(true);
    } else {
      setSheetMissing(false);
      setSheet((sheetRes.data as ShiftSheet) ?? null);
    }

    // Sayaçlar istasyonundur, kişiye ait değil: önceki okuma, kim girerse
    // girsin bir önceki nöbetlerden hortum bazında en yeni dolu değerdir.
    const prevIds = ((prevRes.data as { id: string }[]) ?? []).map((r) => r.id);
    const merged: Record<string, MeterReading> = {};
    if (prevIds.length > 0 && !(sheetRes.error && isMissingTable(sheetRes.error.code))) {
      const { data: prevSheets } = await supabase
        .from('shift_sheets')
        .select('shift_id, meters')
        .in('shift_id', prevIds);
      const byShift = new Map(
        ((prevSheets as Pick<ShiftSheet, 'shift_id' | 'meters'>[]) ?? []).map((s) => [s.shift_id, s.meters]),
      );
      for (const sid of prevIds) {
        for (const [kod, r] of Object.entries(byShift.get(sid) ?? {})) {
          const cur = merged[kod] ?? { m: null, e: null };
          merged[kod] = { m: cur.m ?? r.m ?? null, e: cur.e ?? r.e ?? null };
        }
      }
    }
    setPrevMeters(merged);
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
    const { data, error } = await supabase
      .from('shift_sheets')
      .upsert({
        shift_id: shift.id,
        meters,
        extras,
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) {
      feedback.error();
      showAlert('Hata', error.message);
      return false;
    }
    feedback.success();
    setSheet(data as ShiftSheet);
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
