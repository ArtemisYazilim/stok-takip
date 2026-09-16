import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, EmptyState, Input, Screen, colors } from '@/components/ui';
import { confirmAction, showAlert } from '@/lib/alerts';
import { feedback } from '@/lib/feedback';
import {
  formatDateTime,
  formatDayDateTime,
  formatDuration,
  formatMoney,
  formatQty,
} from '@/lib/format';
import { supabase } from '@/lib/supabase';
import {
  MOVEMENT_LABELS,
  type AppNotification,
  type MovementType,
  type Note,
  type Profile,
  type Shift,
  type StockMovement,
} from '@/lib/types';

const TYPE_COLORS: Record<string, string> = {
  satis: colors.primary,
  alim: colors.success,
  duzeltme: colors.warning,
  iade: colors.textMuted,
};

type TypeFilter = 'all' | MovementType | 'not' | 'bildirim';
type TimeFilter = 'all' | 'today' | '7d' | '30d';

const TYPE_OPTS: { v: TypeFilter; label: string }[] = [
  { v: 'all', label: 'Tümü' },
  { v: 'satis', label: 'Satış' },
  { v: 'alim', label: 'Alım' },
  { v: 'iade', label: 'İade' },
  { v: 'duzeltme', label: 'Düzeltme' },
  { v: 'not', label: 'Not' },
  { v: 'bildirim', label: 'Bildirim' },
];

const TIME_OPTS: { v: TimeFilter; label: string }[] = [
  { v: 'all', label: 'Tümü' },
  { v: 'today', label: 'Bugün' },
  { v: '7d', label: 'Son 7 gün' },
  { v: '30d', label: 'Son 30 gün' },
];

/** Akıştaki tek kayıt: stok hareketi, çalışan notu veya bildirim. */
interface FeedEntry {
  key: string;
  kind: 'movement' | 'note' | 'notification';
  createdAt: string;
  shiftId: string | null;
  personId: string | null;
  searchText: string;
  m?: StockMovement;
  n?: Note;
  x?: AppNotification;
}

type ListRow =
  | {
      header: true;
      key: string;
      title: string;
      meta: string;
      open: boolean;
      salesText: string | null;
    }
  | { header: false; key: string; entry: FeedEntry };

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

export default function MovementsScreen() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [fType, setFType] = useState<TypeFilter>('all');
  const [fPerson, setFPerson] = useState<string>('all');
  const [fTime, setFTime] = useState<TimeFilter>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const [movRes, noteRes, notifRes, shiftRes, profRes] = await Promise.all([
      supabase
        .from('stock_movements')
        .select('*, products(name, unit), profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(300),
      // Notlar 004 geçişiyle gelir; tablo henüz yoksa akış notsuz çalışır.
      supabase
        .from('notes')
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('shifts')
        .select('*, profiles(full_name)')
        .order('started_at', { ascending: false })
        .limit(80),
      supabase.from('profiles').select('*').order('created_at'),
    ]);
    setMovements((movRes.data as StockMovement[]) ?? []);
    setNotes(noteRes.error ? [] : ((noteRes.data as Note[]) ?? []));
    setNotifs((notifRes.data as AppNotification[]) ?? []);
    setShifts((shiftRes.data as Shift[]) ?? []);
    setProfiles((profRes.data as Profile[]) ?? []);
  }, []);

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

  async function removeNote(n: Note) {
    const onay = await confirmAction('Notu sil', 'Bu not kalıcı olarak silinecek.', 'Sil');
    if (!onay) return;
    const { error } = await supabase.from('notes').delete().eq('id', n.id);
    if (error) {
      feedback.error();
      showAlert('Hata', error.message);
      return;
    }
    feedback.success();
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
  }

  const entries = useMemo<FeedEntry[]>(() => {
    const list: FeedEntry[] = [];
    for (const m of movements) {
      const person = m.profiles?.full_name || 'Bilinmiyor';
      list.push({
        key: `m-${m.id}`,
        kind: 'movement',
        createdAt: m.created_at,
        shiftId: m.shift_id,
        personId: m.profile_id,
        searchText:
          `${m.products?.name ?? ''} ${person} ${m.note ?? ''} ${MOVEMENT_LABELS[m.type]}`.toLocaleLowerCase('tr'),
        m,
      });
    }
    for (const n of notes) {
      const person = n.profiles?.full_name || 'Çalışan';
      list.push({
        key: `n-${n.id}`,
        kind: 'note',
        createdAt: n.created_at,
        shiftId: null,
        personId: n.profile_id,
        searchText: `${person} ${n.body}`.toLocaleLowerCase('tr'),
        n,
      });
    }
    for (const x of notifs) {
      list.push({
        key: `b-${x.id}`,
        kind: 'notification',
        createdAt: x.created_at,
        shiftId: x.shift_id,
        personId: null,
        searchText: `${x.title} ${x.body}`.toLocaleLowerCase('tr'),
        x,
      });
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }, [movements, notes, notifs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    const since = timeThreshold(fTime);
    return entries.filter((e) => {
      if (fType === 'not' && e.kind !== 'note') return false;
      if (fType === 'bildirim' && e.kind !== 'notification') return false;
      if (
        fType !== 'all' &&
        fType !== 'not' &&
        fType !== 'bildirim' &&
        (e.kind !== 'movement' || e.m?.type !== fType)
      ) {
        return false;
      }
      if (fPerson !== 'all' && e.personId !== fPerson) return false;
      if (since !== null && new Date(e.createdAt).getTime() < since) return false;
      if (q && !e.searchText.includes(q)) return false;
      return true;
    });
  }, [entries, fType, fPerson, fTime, search]);

  const filterActive = fType !== 'all' || fPerson !== 'all' || fTime !== 'all' || search.trim() !== '';

  // Filtre yokken kayıtlar vardiya bazında gruplanır: açık vardiyalar en üstte,
  // önceki vardiyalar altında; daha eskisi filtre ve aramayla bulunur.
  const rows = useMemo<ListRow[]>(() => {
    if (filterActive) {
      return filtered.map((entry) => ({ header: false, key: entry.key, entry }));
    }

    const shiftMap = new Map(shifts.map((s) => [s.id, s]));
    const byGroup = new Map<string, FeedEntry[]>();
    for (const e of filtered) {
      let gid = 'none';
      if (e.kind === 'movement' && e.m?.shift_id && shiftMap.has(e.m.shift_id)) {
        gid = e.m.shift_id;
      } else if (e.kind === 'notification' && e.x?.shift_id && shiftMap.has(e.x.shift_id)) {
        gid = e.x.shift_id;
      } else if (e.kind === 'note' && e.n) {
        // Notun vardiyası: yazan kişinin, not anını kapsayan vardiyası.
        const t = new Date(e.createdAt).getTime();
        const s = shifts.find(
          (sh) =>
            sh.profile_id === e.n!.profile_id &&
            new Date(sh.started_at).getTime() <= t &&
            (sh.ended_at ? t <= new Date(sh.ended_at).getTime() : true),
        );
        if (s) gid = s.id;
      }
      const arr = byGroup.get(gid) ?? [];
      arr.push(e);
      byGroup.set(gid, arr);
    }

    const ordered = [...shifts].sort((a, b) => {
      const ao = a.ended_at ? 1 : 0;
      const bo = b.ended_at ? 1 : 0;
      if (ao !== bo) return ao - bo;
      return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
    });

    const out: ListRow[] = [];
    for (const s of ordered) {
      const groupItems = byGroup.get(s.id) ?? [];
      const open = !s.ended_at;
      if (!open && groupItems.length === 0) continue;
      let revenue = 0;
      let qty = 0;
      for (const e of groupItems) {
        if (e.kind === 'movement' && e.m?.type === 'satis') {
          revenue += e.m.qty * (e.m.unit_price ?? 0);
          qty += e.m.qty;
        }
      }
      out.push({
        header: true,
        key: `shift-${s.id}`,
        title: s.profiles?.full_name || 'Çalışan',
        meta: `${formatDateTime(s.started_at)} → ${
          s.ended_at ? formatDateTime(s.ended_at) : 'devam ediyor'
        } · ${formatDuration(s.started_at, s.ended_at)}`,
        open,
        salesText: revenue > 0 ? `Satış ${formatMoney(revenue)} · ${formatQty(qty)} adet` : null,
      });
      for (const e of groupItems) out.push({ header: false, key: e.key, entry: e });
    }

    const noneItems = byGroup.get('none') ?? [];
    if (noneItems.length > 0) {
      out.push({
        header: true,
        key: 'shift-none',
        title: 'Vardiya dışı kayıtlar',
        meta: 'Bir vardiyaya bağlı olmayan hareket, not ve bildirimler',
        open: false,
        salesText: null,
      });
      for (const e of noneItems) out.push({ header: false, key: e.key, entry: e });
    }
    return out;
  }, [filtered, filterActive, shifts]);

  function clearFilters() {
    setFType('all');
    setFPerson('all');
    setFTime('all');
    setSearch('');
  }

  function renderEntry(e: FeedEntry) {
    if (e.kind === 'movement' && e.m) {
      const m = e.m;
      return (
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.rowName}>{m.products?.name ?? 'Ürün'}</Text>
            <Text style={styles.rowMeta}>
              {m.profiles?.full_name || 'Bilinmiyor'} · {formatDateTime(m.created_at)}
            </Text>
            {m.note ? <Text style={styles.rowNote}>{m.note}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={[styles.rowDelta, { color: m.delta < 0 ? colors.danger : colors.success }]}>
              {m.delta > 0 ? '+' : ''}
              {formatQty(m.delta)}
            </Text>
            <Badge
              text={MOVEMENT_LABELS[m.type] ?? m.type}
              color={TYPE_COLORS[m.type] ?? colors.textMuted}
            />
          </View>
        </View>
      );
    }
    if (e.kind === 'note' && e.n) {
      const n = e.n;
      return (
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="create-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.rowBody}>{n.body}</Text>
            <Text style={styles.rowMeta}>
              {n.profiles?.full_name || 'Çalışan'} · {formatDayDateTime(n.created_at)}
            </Text>
          </View>
          <Pressable hitSlop={8} onPress={() => removeNote(n)}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      );
    }
    if (e.kind === 'notification' && e.x) {
      const x = e.x;
      const accent = x.has_diff ? colors.danger : colors.success;
      return (
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: `${accent}1a` }]}>
            <Ionicons name={x.has_diff ? 'alert-circle' : 'checkmark-circle'} size={20} color={accent} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.rowName}>{x.title}</Text>
            <Text style={styles.rowBody}>{x.body}</Text>
            <Text style={styles.rowMeta}>{formatDateTime(x.created_at)}</Text>
          </View>
          <Badge text="Bildirim" color={accent} />
        </View>
      );
    }
    return null;
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Hareketler</Text>
        <Text style={styles.subtitle}>
          Satış, alım, iade, not ve bildirimler tek akışta. Açık vardiya en üstte.
        </Text>
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
              placeholder="Ara: ürün, kişi, not..."
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
                <Chip label="Herkes" active={fPerson === 'all'} onPress={() => setFPerson('all')} />
                {profiles.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.full_name || '(İsimsiz)'}
                    active={fPerson === p.id}
                    onPress={() => setFPerson(p.id)}
                  />
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
            text={filterActive ? 'Filtreye uyan kayıt yok.' : 'Henüz kayıt yok.'}
          />
        }
        renderItem={({ item }) =>
          item.header ? (
            <View style={[styles.shiftHead, item.open && styles.shiftHeadOpen]}>
              <View style={styles.shiftTopRow}>
                <Text style={styles.shiftTitle}>{item.title}</Text>
                {item.key !== 'shift-none' ? (
                  <Badge
                    text={item.open ? 'Açık vardiya' : 'Kapalı'}
                    color={item.open ? colors.success : colors.textMuted}
                  />
                ) : null}
              </View>
              <Text style={styles.shiftMeta}>{item.meta}</Text>
              {item.salesText ? <Text style={styles.shiftSales}>{item.salesText}</Text> : null}
            </View>
          ) : (
            renderEntry(item.entry)
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
  shiftTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  shiftMeta: {
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
  rowBody: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
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
