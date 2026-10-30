import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { PompaGecmisi } from '@/components/cizelge/pompa-gecmisi';
import { PompaSayfasi } from '@/components/cizelge/pompa-sayfasi';
import { Badge, colors } from '@/components/ui';
import { showAlert } from '@/lib/alerts';
import { loadPrevMeters, loadSheet, loadSheetChanges, saveSheet } from '@/lib/cizelge-verisi';
import { feedback } from '@/lib/feedback';
import { formatDateKey, toDateKey } from '@/lib/format';
import { loadOilSheet } from '@/lib/nobet-stok';
import type { MeterReading, Shift, ShiftSheet, ShiftSheetChange, ShiftSheetExtras } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

/**
 * Bir nöbetin 2. sayfası (pompa sayaçları) admin gözüyle: önce salt okunur,
 * düzeltme gerekirse "Düzenle" ile açılır; admin düzeltmesi de geçmişe kendi
 * adıyla düşer. Altında kimin hangi hücreyi neyden neye değiştirdiği yazar.
 * Hem pompa ekranı hem admin stok ekranının "2. Sayfa"sı bunu kullanır.
 */
export function AdminPompa({ shift }: { shift: Shift }) {
  const { session } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [sheet, setSheet] = useState<ShiftSheet | null>(null);
  const [sheetMissing, setSheetMissing] = useState(false);
  const [prevMeters, setPrevMeters] = useState<Record<string, MeterReading>>({});
  const [revenue, setRevenue] = useState(0);
  const [changes, setChanges] = useState<ShiftSheetChange[]>([]);
  const [changesMissing, setChangesMissing] = useState(false);
  const [editing, setEditing] = useState(false);

  const loadChanges = useCallback(async () => {
    const res = await loadSheetChanges(shift.id);
    setChanges(res.changes);
    setChangesMissing(res.missing);
  }, [shift.id]);

  const load = useCallback(async () => {
    const [oil, sheetData, prev] = await Promise.all([
      loadOilSheet(shift),
      loadSheet(shift.id),
      loadPrevMeters(shift.started_at),
      loadChanges(),
    ]);
    setRevenue(oil.revenue);
    setSheet(sheetData.sheet);
    setSheetMissing(sheetData.missing);
    setPrevMeters(prev);
    setLoaded(true);
  }, [shift, loadChanges]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onSave(meters: Record<string, MeterReading>, extras: ShiftSheetExtras) {
    if (!session) return false;
    const { sheet: saved, error } = await saveSheet(shift.id, session.user.id, meters, extras);
    if (error) {
      feedback.error();
      showAlert('Hata', error);
      return false;
    }
    feedback.success();
    setSheet(saved);
    setEditing(false);
    await loadChanges();
    return true;
  }

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const open = !shift.ended_at;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.bar}>
        <Text style={styles.meta} numberOfLines={1}>
          Pompacı: <Text style={styles.metaStrong}>{shift.profiles?.full_name || '—'}</Text> ·{' '}
          {formatDateKey(toDateKey(shift.started_at))}
        </Text>
        <Badge text={open ? 'Açık' : 'Kapandı'} color={open ? colors.success : colors.textMuted} />
        {!sheetMissing ? (
          <Pressable
            onPress={() => {
              feedback.press();
              setEditing((v) => !v);
            }}
            style={[styles.editBtn, editing && styles.editBtnActive]}
          >
            <Text style={[styles.editText, editing && styles.editTextActive]}>
              {editing ? 'Düzenlemeyi Bitir' : 'Düzenle'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <PompaSayfasi
        key={sheet?.updated_at ?? 'bos'}
        sheet={sheet}
        prevMeters={prevMeters}
        oilRevenue={revenue}
        editable={editing}
        tableMissing={sheetMissing}
        onSave={onSave}
        footer={<PompaGecmisi changes={changes} missing={changesMissing} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  meta: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
  },
  metaStrong: {
    fontWeight: '700',
    color: colors.text,
  },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editBtnActive: {
    backgroundColor: colors.primary,
  },
  editText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  editTextActive: {
    color: colors.card,
  },
});
