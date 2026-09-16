import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, EmptyState, Screen, colors } from '@/components/ui';
import { confirmAction, showAlert } from '@/lib/alerts';
import { feedback } from '@/lib/feedback';
import { formatDateTime, formatDuration, formatTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Profile, Shift } from '@/lib/types';

/** Vardiya başına sayım özeti: kaç ürün sayıldı, kaçında fark var. */
type CountSummary = { total: number; diffs: number };

export default function ShiftsScreen() {
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [summaries, setSummaries] = useState<Record<string, CountSummary>>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [shiftRes, profileRes] = await Promise.all([
      supabase
        .from('shifts')
        .select('*, profiles(full_name)')
        .order('started_at', { ascending: false })
        .limit(60),
      supabase.from('profiles').select('*').eq('active', true).order('full_name'),
    ]);
    const list = (shiftRes.data as Shift[]) ?? [];
    setShifts(list);
    setProfiles((profileRes.data as Profile[]) ?? []);

    // Listelenen vardiyaların sayımlarını tek sorguda çekip fark özetini çıkar.
    const ids = list.map((s) => s.id);
    if (ids.length === 0) {
      setSummaries({});
      return;
    }
    const { data: countData } = await supabase
      .from('shift_counts')
      .select('shift_id, expected_qty, counted_qty')
      .in('shift_id', ids);
    const map: Record<string, CountSummary> = {};
    for (const c of (countData as any[]) ?? []) {
      const s = map[c.shift_id] ?? { total: 0, diffs: 0 };
      s.total += 1;
      if (c.counted_qty !== c.expected_qty) s.diffs += 1;
      map[c.shift_id] = s;
    }
    setSummaries(map);
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

  function renderStatus(item: Shift) {
    if (!item.ended_at) return <Badge text="Açık vardiya" color={colors.success} />;
    const sum = summaries[item.id];
    if (!sum || sum.total === 0) return <Badge text="Sayım yok" color={colors.textMuted} />;
    if (sum.diffs === 0) return <Badge text="Sayım tuttu" color={colors.success} />;
    return <Badge text={`${sum.diffs} üründe fark`} color={colors.danger} />;
  }

  // Vardiya açma izni olmayan (veya unutan) çalışanlar için admin buradan açar.
  async function openShiftFor(p: Profile) {
    setBusy(true);
    const { error } = await supabase.from('shifts').insert({ profile_id: p.id });
    setBusy(false);
    if (error) {
      feedback.error();
      showAlert('Hata', error.message);
      return;
    }
    feedback.success();
    showAlert('Tamam', `${p.full_name || 'Çalışan'} için vardiya açıldı.`);
    setPickerOpen(false);
    await load();
  }

  async function closeShift(item: Shift) {
    const onay = await confirmAction(
      'Vardiyayı kapat',
      `${item.profiles?.full_name || 'Çalışan'} adlı kişinin vardiyası sayım yapılmadan kapatılacak. Emin misiniz?`,
      'Kapat',
    );
    if (!onay) return;
    const { error } = await supabase
      .from('shifts')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) {
      feedback.error();
      showAlert('Hata', error.message);
      return;
    }
    feedback.success();
    await load();
  }

  const openProfileIds = new Set(shifts.filter((s) => !s.ended_at).map((s) => s.profile_id));

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>Vardiyalar</Text>
          <Text style={styles.subtitle}>Bir vardiyaya dokununca satış ve sayım detayı açılır.</Text>
        </View>
        <Button
          title="Vardiya Aç"
          icon="add"
          variant={pickerOpen ? 'ghost' : 'primary'}
          onPress={() => {
            feedback.press();
            setPickerOpen((v) => !v);
          }}
        />
      </View>
      {pickerOpen ? (
        <Card style={styles.picker}>
          {profiles.length === 0 ? (
            <EmptyState text="Aktif kullanıcı yok." />
          ) : (
            profiles.map((p) => {
              const hasOpen = openProfileIds.has(p.id);
              return (
                <Pressable
                  key={p.id}
                  style={[styles.pickerRow, hasOpen && { opacity: 0.5 }]}
                  disabled={hasOpen || busy}
                  onPress={() => openShiftFor(p)}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.rowName}>{p.full_name || '(İsimsiz)'}</Text>
                    <Text style={styles.rowMeta}>
                      {p.role === 'admin' ? 'Admin' : 'Çalışan'}
                    </Text>
                  </View>
                  {hasOpen ? (
                    <Badge text="Vardiyası açık" color={colors.success} />
                  ) : (
                    <Badge text="Aç" color={colors.primary} />
                  )}
                </Pressable>
              );
            })
          )}
        </Card>
      ) : null}
      <FlatList
        data={shifts}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={<EmptyState text="Henüz vardiya kaydı yok." />}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push({ pathname: '/(admin)/vardiya-detay', params: { id: item.id } })}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.rowName}>{item.profiles?.full_name || 'Çalışan'}</Text>
              <Text style={styles.rowMeta}>{formatDateTime(item.started_at)}</Text>
              <Text style={styles.rowSub}>
                {item.ended_at
                  ? `Süre ${formatDuration(item.started_at, item.ended_at)} · bitiş ${formatTime(item.ended_at)}`
                  : `${formatDuration(item.started_at)} sürüyor`}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              {renderStatus(item)}
              {!item.ended_at ? (
                <Pressable hitSlop={6} onPress={() => closeShift(item)}>
                  <Text style={styles.closeLink}>Kapat</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  picker: {
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  closeLink: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.danger,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
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
  rowSub: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
