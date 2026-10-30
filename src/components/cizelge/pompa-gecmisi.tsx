import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/components/ui';
import { groupChanges } from '@/lib/cizelge-verisi';
import { formatDateTime, formatQty } from '@/lib/format';
import { sheetFieldLabel } from '@/lib/pompa';
import type { ShiftSheetChange } from '@/lib/types';

function valueText(v: ShiftSheetChange['old_value']): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return formatQty(v);
  return String(v);
}

/** 2. sayfada kim, ne zaman, hangi hücreyi neyden neye değiştirdi. */
export function PompaGecmisi({ changes, missing }: { changes: ShiftSheetChange[]; missing: boolean }) {
  const groups = groupChanges(changes);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Değişiklik geçmişi</Text>
      {missing ? (
        <Text style={styles.muted}>
          Geçmiş için veritabanı geçişi uygulanmalı: npm run db:push (pompa_degisiklik_gecmisi).
        </Text>
      ) : groups.length === 0 ? (
        <Text style={styles.muted}>Henüz değişiklik yok.</Text>
      ) : (
        groups.map((g) => (
          <View key={g.key} style={styles.group}>
            <Text style={styles.groupHead}>
              {g.who} · {formatDateTime(g.at)} · {g.changes.length} hücre
            </Text>
            {g.changes.map((c) => (
              <View key={c.id} style={styles.line}>
                <Text style={styles.field} numberOfLines={1}>
                  {sheetFieldLabel(c.field)}
                </Text>
                <Text style={styles.values}>
                  <Text style={styles.old}>{valueText(c.old_value)}</Text>
                  {' → '}
                  <Text style={c.new_value === null ? styles.cleared : styles.new}>
                    {c.new_value === null ? 'silindi' : valueText(c.new_value)}
                  </Text>
                </Text>
              </View>
            ))}
          </View>
        ))
      )}
      {!missing ? (
        <Text style={styles.hint}>Geçmiş, bu özellik eklendikten sonraki kayıtlardan başlar.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  muted: {
    fontSize: 13,
    color: colors.textMuted,
  },
  hint: {
    fontSize: 11,
    color: colors.textMuted,
  },
  group: {
    gap: 3,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  groupHead: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryDark,
    marginBottom: 2,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  field: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  values: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    color: colors.textMuted,
  },
  old: {
    color: colors.textMuted,
  },
  new: {
    fontWeight: '700',
    color: colors.text,
  },
  cleared: {
    fontWeight: '700',
    color: colors.danger,
  },
});
