import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, EmptyState, Input, Screen, colors } from '@/components/ui';
import { feedback } from '@/lib/feedback';
import { formatDateTime, formatDuration, formatMoney, formatQty, movementEffect } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { MOVEMENT_LABELS, type MovementType, type Shift, type StockMovement } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

/** Raf değişimi; depodan çıkışta depo düşüşü altında ayrıca yazılır. */
function MovementDelta({ m }: { m: StockMovement }) {
  const effect = movementEffect(m);
  return (
    <>
      <Text style={[styles.rowDelta, { color: effect.negative ? colors.danger : colors.success }]}>
        {effect.main}
      </Text>
      {effect.depot ? <Text style={styles.rowNote}>{effect.depot}</Text> : null}
    </>
  );
}

const TYPE_COLORS: Record<string, string> = {
  satis: colors.primary,
  iade: colors.textMuted,
  cikis: colors.primaryDark,
  depo_alim: colors.success,
};

type TypeFilter = 'all' | MovementType;
type TimeFilter = 'all' | 'today' | '7d' | '30d';

const TYPE_OPTS: { v: TypeFilter; label: string }[] = [
  { v: 'all', label: 'Tümü' },
  { v: 'satis', label: 'Satış' },
  { v: 'iade', label: 'İade' },
  { v: 'cikis', label: 'Depodan Çıkış' },
];

const TIME_OPTS: { v: TimeFilter; label: string }[] = [
  { v: 'all', label: 'Tümü' },
  { v: 'today', label: 'Bugün' },
  { v: '7d', label: 'Son 7 gün' },
  { v: '30d', label: 'Son 30 gün' },
];

function timeThreshold(f: TimeFilter): number | null {
  if (f === 'all') return null;
  const now = new Date();
  if (f === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  return now.getTime() - (f === '7d' ? 7 : 30) * 86_400_000;
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        feedback.press();
        onPress();
      }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

type ListRow =
  | {
      header: true;
      key: string;
      meta: string;
      open: boolean;
      salesText: string | null;
    }
  | { header: false; key: string; movement: StockMovement };

/**
 * Çalışanın kendi hareketleri: yaptığı satış ve iadeler vardiya bazında
 * gruplanır; açık vardiya en üstte görünür. Filtre/arama varken düz liste olur.
 */
export default function MyMovementsScreen() {
  const { session } = useAuth();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [fType, setFType] = useState<TypeFilter>('all');
  const [fTime, setFTime] = useState<TimeFilter>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    const [movRes, shiftRes] = await Promise.all([
      supabase
        .from('stock_movements')
        .select('*, products(name, unit)')
        .eq('profile_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('shifts')
        .select('*')
        .eq('profile_id', session.user.id)
        .order('started_at', { ascending: false })
        .limit(80),
    ]);
    setMovements((movRes.data as StockMovement[]) ?? []);
    setShifts((shiftRes.data as Shift[]) ?? []);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    const since = timeThreshold(fTime);
    return movements.filter((m) => {
      if (fType !== 'all' && m.type !== fType) return false;
      if (since !== null && new Date(m.created_at).getTime() < since) return false;
      if (q && !`${m.products?.name ?? ''} ${m.note ?? ''}`.toLocaleLowerCase('tr').includes(q)) {
        return false;
      }
      return true;
    });
  }, [movements, fType, fTime, search]);

  const filterActive = fType !== 'all' || fTime !== 'all' || search.trim() !== '';

  const rows = useMemo<ListRow[]>(() => {
    if (filterActive) {
      return filtered.map((m) => ({ header: false, key: m.id, movement: m }));
    }

    const shiftIds = new Set(shifts.map((s) => s.id));
    const byShift = new Map<string, StockMovement[]>();
    const none: StockMovement[] = [];
    for (const m of filtered) {
      if (m.shift_id && shiftIds.has(m.shift_id)) {
        const arr = byShift.get(m.shift_id) ?? [];
        arr.push(m);
        byShift.set(m.shift_id, arr);
      } else {
        none.push(m);
      }
    }

    const ordered = [...shifts].sort((a, b) => {
      const ao = a.ended_at ? 1 : 0;
      const bo = b.ended_at ? 1 : 0;
      if (ao !== bo) return ao - bo;
      return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
    });

    const out: ListRow[] = [];
    for (const s of ordered) {
      const items = byShift.get(s.id) ?? [];
      const open = !s.ended_at;
      if (!open && items.length === 0) continue;
      let revenue = 0;
      let qty = 0;
      for (const m of items) {
        if (m.type === 'satis') {
          revenue += m.qty * (m.unit_price ?? 0);
          qty += m.qty;
        }
      }
      out.push({
        header: true,
        key: `shift-${s.id}`,
        meta: `${formatDateTime(s.started_at)} → ${
          s.ended_at ? formatDateTime(s.ended_at) : 'devam ediyor'
        } · ${formatDuration(s.started_at, s.ended_at)}`,
        open,
        salesText: revenue > 0 ? `Satış ${formatMoney(revenue)} · ${formatQty(qty)} adet` : null,
      });
      for (const m of items) out.push({ header: false, key: m.id, movement: m });
    }

    if (none.length > 0) {
      out.push({
        header: true,
        key: 'shift-none',
        meta: 'Bir vardiyaya bağlı olmayan hareketler',
        open: false,
        salesText: null,
      });
      for (const m of none) out.push({ header: false, key: m.id, movement: m });
    }
    return out;
  }, [filtered, filterActive, shifts]);

  function clearFilters() {
    setFType('all');
    setFTime('all');
    setSearch('');
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Hareketlerim</Text>
        <Text style={styles.subtitle}>Yaptığın satış ve iadeler vardiya bazında listelenir.</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.filters}>
            <Input
              value={search}
              onChangeText={setSearch}
              placeholder="Ara: ürün, not..."
              autoCapitalize="none"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {TYPE_OPTS.map((o) => (
                  <Chip key={o.v} label={o.label} active={fType === o.v} onPress={() => setFType(o.v)} />
                ))}
              </View>
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {TIME_OPTS.map((o) => (
                  <Chip key={o.v} label={o.label} active={fTime === o.v} onPress={() => setFTime(o.v)} />
                ))}
              </View>
            </ScrollView>
            <View style={styles.countRow}>
              <Text style={styles.countText}>{filtered.length} kayıt</Text>
              {filterActive ? (
                <Pressable hitSlop={6} onPress={clearFilters}>
                  <Text style={styles.clearText}>Filtreleri temizle</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            text={filterActive ? 'Filtreye uyan kayıt yok.' : 'Henüz hareketin yok.'}
          />
        }
        renderItem={({ item }) =>
          item.header ? (
            <View style={[styles.shiftHead, item.open && styles.shiftHeadOpen]}>
              <View style={styles.shiftTopRow}>
                <Text style={styles.shiftMeta}>{item.meta}</Text>
                {item.key !== 'shift-none' ? (
                  <Badge
                    text={item.open ? 'Açık vardiya' : 'Kapalı'}
                    color={item.open ? colors.success : colors.textMuted}
                  />
                ) : null}
              </View>
              {item.salesText ? <Text style={styles.shiftSales}>{item.salesText}</Text> : null}
            </View>
          ) : (
            <View style={styles.row}>
              <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
                <Ionicons
                  name={
                    item.movement.type === 'satis'
                      ? 'cart-outline'
                      : item.movement.type === 'cikis'
                        ? 'archive-outline'
                        : 'return-down-back-outline'
                  }
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.rowName}>{item.movement.products?.name ?? 'Ürün'}</Text>
                <Text style={styles.rowMeta}>{formatDateTime(item.movement.created_at)}</Text>
                {item.movement.note ? (
                  <Text style={styles.rowNote}>{item.movement.note}</Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <MovementDelta m={item.movement} />
                <Badge
                  text={MOVEMENT_LABELS[item.movement.type] ?? item.movement.type}
                  color={TYPE_COLORS[item.movement.type] ?? colors.textMuted}
                />
              </View>
            </View>
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 8,
  },
  filters: {
    gap: 8,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chipTextActive: {
    color: '#fff',
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  countText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  clearText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  shiftHead: {
    marginTop: 8,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 3,
  },
  shiftHeadOpen: {
    borderColor: `${colors.success}66`,
    backgroundColor: `${colors.success}0d`,
  },
  shiftTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  shiftMeta: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
  },
  shiftSales: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.success,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
  rowNote: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  rowDelta: {
    fontSize: 15,
    fontWeight: '700',
  },
});
