import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, Screen, colors } from '@/components/ui';
import { useOpenShift } from '@/hooks/use-open-shift';
import { showAlert } from '@/lib/alerts';
import { feedback } from '@/lib/feedback';
import { formatDateKey, formatDateTime, formatLongDateKey, formatTime, fromDateKey, toDateKey } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Shift } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

/** Pazartesi ile başlayan ay ızgarası; ay dışındaki hücreler null. */
function buildMonthGrid(year: number, month: number): (string | null)[] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(toDateKey(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function NobetScreen() {
  const router = useRouter();
  const { session, profile, signOut } = useAuth();
  const { shift: openShift, loaded, reload } = useOpenShift();
  const [picked, setPicked] = useState<string | null>(null);
  const [month, setMonth] = useState<{ y: number; m: number } | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [busy, setBusy] = useState(false);

  const todayKey = toDateKey(new Date());
  const openKey = openShift ? toDateKey(openShift.started_at) : null;
  // Elle seçim yoksa açık nöbetin günü, o da yoksa bugün seçili gelir.
  const selected = picked ?? openKey ?? todayKey;
  const selDate = fromDateKey(selected);
  const view = month ?? { y: selDate.getFullYear(), m: selDate.getMonth() };

  // Görünen ay ile seçili gün farklı aylarda olabilir (ay değiştirip geri
  // dönmeden kart okunuyor); ikisini de kapsayan aralık çekilir.
  const monthStart = new Date(view.y, view.m, 1).getTime();
  const monthEnd = new Date(view.y, view.m + 1, 1).getTime();
  const selStart = selDate.getTime();
  const selEnd = new Date(selDate.getFullYear(), selDate.getMonth(), selDate.getDate() + 1).getTime();
  const fromMs = Math.min(monthStart, selStart);
  const toMs = Math.max(monthEnd, selEnd);

  const loadShifts = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('profile_id', session.user.id)
      .gte('started_at', new Date(fromMs).toISOString())
      .lt('started_at', new Date(toMs).toISOString())
      .order('started_at', { ascending: false });
    setShifts((data as Shift[]) ?? []);
  }, [session, fromMs, toMs]);

  useFocusEffect(
    useCallback(() => {
      reload();
      loadShifts();
    }, [reload, loadShifts]),
  );

  const byDay = new Map<string, Shift[]>();
  for (const s of shifts) {
    const key = toDateKey(s.started_at);
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }

  function openSheet(shiftId: string) {
    feedback.press();
    router.push({ pathname: '/(calisan)/cizelge', params: { id: shiftId } });
  }

  function changeMonth(delta: number) {
    feedback.press();
    const d = new Date(view.y, view.m + delta, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  }

  async function startShift() {
    if (!session) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('shifts')
      .insert({ profile_id: session.user.id })
      .select('id')
      .single();
    setBusy(false);
    if (error || !data) {
      feedback.error();
      showAlert('Hata', error?.message ?? 'Nöbet açılamadı.');
      return;
    }
    feedback.success();
    await Promise.all([reload(), loadShifts()]);
    router.push({ pathname: '/(calisan)/cizelge', params: { id: data.id as string } });
  }

  const cells = buildMonthGrid(view.y, view.m);
  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  });
  const daySh = byDay.get(selected) ?? [];
  const canOpen = profile?.can_open_shift ?? true;

  function renderAction() {
    if (!loaded) return null;

    if (daySh.length > 0) {
      return (
        <View style={{ gap: 8 }}>
          {daySh.map((s) => {
            const isOpen = !s.ended_at;
            return (
              <Pressable
                key={s.id}
                onPress={() => openSheet(s.id)}
                style={({ pressed }) => [styles.shiftRow, pressed && { opacity: 0.7 }]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Badge
                    text={isOpen ? 'Nöbet açık' : 'Nöbet kapandı'}
                    color={isOpen ? colors.success : colors.textMuted}
                  />
                  <Text style={styles.shiftTime}>
                    {formatTime(s.started_at)} –{' '}
                    {s.ended_at ? formatDateTime(s.ended_at) : 'devam ediyor'}
                  </Text>
                </View>
                <Text style={styles.shiftGo}>{isOpen ? 'Çizelgeyi aç' : 'Çizelgeyi gör'}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              </Pressable>
            );
          })}
        </View>
      );
    }

    // Seçili günde nöbet yok. Tek açık nöbet kuralı (one_open_shift_per_user)
    // yüzünden başka günde açık nöbet varken yenisi açılamaz.
    if (openShift && openKey) {
      return (
        <View style={{ gap: 10 }}>
          <Text style={styles.hint}>
            Bu tarihte nöbet kaydın yok. {formatDateKey(openKey)} tarihinde açık nöbetin var; yeni
            nöbet açmadan önce onu devretmelisin.
          </Text>
          <Button title="Açık Nöbete Git" onPress={() => openSheet(openShift.id)} />
        </View>
      );
    }

    if (selected !== todayKey) {
      return <Text style={styles.hint}>Bu tarihte nöbet kaydın yok.</Text>;
    }

    if (!canOpen) {
      return (
        <View style={{ gap: 10 }}>
          <Text style={styles.hint}>
            Nöbet açma yetkin yok. Admin senin için nöbet başlattığında burada görünür.
          </Text>
          <Button title="Yenile" variant="ghost" onPress={reload} />
        </View>
      );
    }

    return (
      <View style={{ gap: 10 }}>
        <Text style={styles.hint}>
          Bugün nöbetteysen başlat. Gün boyu yağ satışlarını 1. sayfaya, pompa sayaçlarını 2.
          sayfaya gireceksin.
        </Text>
        <Button title="Nöbeti Başlat" icon="play" onPress={startShift} loading={busy} />
      </View>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Nöbet Günü</Text>
          <Text style={styles.subtitle}>{profile?.full_name}</Text>
        </View>
        <Pressable onPress={signOut} hitSlop={8}>
          <Ionicons name="log-out-outline" size={24} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.hint}>Nöbette olduğun günü seç, o günün çizelgesi açılsın.</Text>

        <Card style={{ gap: 10 }}>
          <View style={styles.monthRow}>
            <Pressable onPress={() => changeMonth(-1)} hitSlop={10} style={styles.monthBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.primary} />
            </Pressable>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <Pressable onPress={() => changeMonth(1)} hitSlop={10} style={styles.monthBtn}>
              <Ionicons name="chevron-forward" size={22} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.grid}>
            {WEEKDAYS.map((w) => (
              <View key={w} style={styles.cell}>
                <Text style={styles.weekday}>{w}</Text>
              </View>
            ))}
            {cells.map((key, i) => {
              if (!key) return <View key={`bos-${i}`} style={styles.cell} />;
              const future = key > todayKey;
              const isSel = key === selected;
              const isToday = key === todayKey;
              const dayShifts = byDay.get(key) ?? [];
              const hasOpen = key === openKey || dayShifts.some((s) => !s.ended_at);
              return (
                <View key={key} style={styles.cell}>
                  <Pressable
                    disabled={future}
                    onPress={() => {
                      feedback.press();
                      setPicked(key);
                    }}
                    style={[
                      styles.day,
                      isToday && styles.dayToday,
                      isSel && styles.daySelected,
                      future && { opacity: 0.3 },
                    ]}
                  >
                    <Text style={[styles.dayText, isSel && styles.dayTextSelected]}>
                      {fromDateKey(key).getDate()}
                    </Text>
                    <View
                      style={[
                        styles.dot,
                        dayShifts.length > 0 && { backgroundColor: colors.textMuted },
                        hasOpen && { backgroundColor: colors.success },
                        isSel && dayShifts.length > 0 && { backgroundColor: '#fff' },
                      ]}
                    />
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View style={styles.legend}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendText}>açık nöbet</Text>
            <View style={[styles.dot, { backgroundColor: colors.textMuted, marginLeft: 10 }]} />
            <Text style={styles.legendText}>kapanmış nöbet</Text>
          </View>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={styles.selTitle}>{formatLongDateKey(selected)}</Text>
          {renderAction()}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'capitalize',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 3,
  },
  weekday: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  day: {
    width: 40,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayToday: {
    borderColor: colors.primary,
  },
  daySelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  dayTextSelected: {
    color: '#fff',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    justifyContent: 'center',
  },
  legendText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  selTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  shiftTime: {
    fontSize: 13,
    color: colors.text,
  },
  shiftGo: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
});
