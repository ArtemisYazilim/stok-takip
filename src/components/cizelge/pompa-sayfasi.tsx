import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, colors } from '@/components/ui';
import { showAlert } from '@/lib/alerts';
import { feedback } from '@/lib/feedback';
import { formatMoney, formatQty, parseNumberInput } from '@/lib/format';
import {
  FUEL_COLORS,
  HOSES,
  PMP_COUNT,
  PMP_ROWS,
  SUMMARY_FIELDS,
  type SummaryKey,
} from '@/lib/pompa';
import type { MeterReading, ShiftSheet, ShiftSheetExtras } from '@/lib/types';

interface Props {
  sheet: ShiftSheet | null;
  /** Hortum başına bir önceki nöbetin okuması; fark hesabı ve ipucu için. */
  prevMeters: Record<string, MeterReading>;
  /** 1. sayfanın toplamı; kağıttaki "YAĞ SATIŞI" satırı. */
  oilRevenue: number;
  editable: boolean;
  /** gun_cizelgesi geçişi henüz uygulanmadıysa kayıt yapılamaz. */
  tableMissing: boolean;
  onSave: (meters: Record<string, MeterReading>, extras: ShiftSheetExtras) => Promise<boolean>;
}

type MeterDraft = Record<string, { m: string; e: string }>;

function toText(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(n);
}

/** Boş metin = girilmemiş (null); geçersizse undefined. */
function parseOptional(text: string): number | null | undefined {
  if (text.trim() === '') return null;
  return parseNumberInput(text) ?? undefined;
}

const SERBEST_MIN_ROWS = 3;

export function PompaSayfasi({ sheet, prevMeters, oilRevenue, editable, tableMissing, onSave }: Props) {
  // Taslaklar kayıtlı çizelgeden bir kez kurulur; ekran kayıttan sonra
  // `key` değişimiyle yeniden kurulduğu için effect ile senkron gerekmez.
  const [meters, setMeters] = useState<MeterDraft>(() =>
    Object.fromEntries(
      HOSES.map((h) => [
        h.kod,
        { m: toText(sheet?.meters[h.kod]?.m), e: toText(sheet?.meters[h.kod]?.e) },
      ]),
    ),
  );
  const [summary, setSummary] = useState<Record<SummaryKey, string>>(
    () =>
      Object.fromEntries(
        SUMMARY_FIELDS.map((f) => [f.key, toText(sheet?.extras[f.key])]),
      ) as Record<SummaryKey, string>,
  );
  const [pmp, setPmp] = useState<string[][]>(() =>
    Array.from({ length: PMP_COUNT }, (_, c) =>
      Array.from({ length: PMP_ROWS }, (_, r) => toText(sheet?.extras.pmp?.[c]?.[r])),
    ),
  );
  const [serbest, setSerbest] = useState<{ aciklama: string; tutar: string }[]>(() => {
    const saved = (sheet?.extras.serbest ?? []).map((s) => ({
      aciklama: s.aciklama,
      tutar: toText(s.tutar),
    }));
    while (saved.length < SERBEST_MIN_ROWS) saved.push({ aciklama: '', tutar: '' });
    return saved;
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit = editable && !tableMissing;

  function setMeter(kod: string, field: 'm' | 'e', text: string) {
    setDirty(true);
    setMeters((prev) => ({ ...prev, [kod]: { ...prev[kod], [field]: text } }));
  }

  function setPmpCell(col: number, row: number, text: string) {
    setDirty(true);
    setPmp((prev) => prev.map((c, ci) => (ci === col ? c.map((v, ri) => (ri === row ? text : v)) : c)));
  }

  function setSerbestCell(index: number, field: 'aciklama' | 'tutar', text: string) {
    setDirty(true);
    setSerbest((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: text } : s)));
  }

  async function save() {
    const errors: string[] = [];
    const num = (text: string, label: string): number | null => {
      const v = parseOptional(text);
      if (v === undefined) {
        errors.push(label);
        return null;
      }
      return v;
    };

    const outMeters: Record<string, MeterReading> = {};
    for (const h of HOSES) {
      const d = meters[h.kod];
      const m = num(d.m, `${h.yakit} ${h.kod} M.SAYAÇ`);
      const e = num(d.e, `${h.yakit} ${h.kod} E.SAYAÇ`);
      if (m !== null || e !== null) outMeters[h.kod] = { m, e };
    }

    const extras: ShiftSheetExtras = {};
    for (const f of SUMMARY_FIELDS) extras[f.key] = num(summary[f.key], f.label);
    extras.pmp = pmp.map((col, c) => col.map((v, r) => num(v, `PMP${c + 1} ${r + 1}. satır`)));
    extras.serbest = serbest
      .map((s, i) => ({ aciklama: s.aciklama.trim(), tutar: num(s.tutar, `${i + 1}. satır tutarı`) }))
      .filter((s) => s.aciklama !== '' || s.tutar !== null);

    if (errors.length > 0) {
      feedback.error();
      showAlert('Hata', `Geçerli bir sayı girin: ${errors.slice(0, 3).join(', ')}`);
      return;
    }

    setBusy(true);
    const ok = await onSave(outMeters, extras);
    setBusy(false);
    if (ok) setDirty(false);
  }

  const pmpTotals = pmp.map((col) =>
    col.reduce((sum, v) => sum + (parseOptional(v) ?? 0), 0),
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        {tableMissing ? (
          <View style={styles.warn}>
            <Ionicons name="warning-outline" size={18} color={colors.warning} />
            <Text style={styles.warnText}>
              2. sayfayı kaydetmek için veritabanı geçişi uygulanmalı: npm run db:push
              (gun_cizelgesi).
            </Text>
          </View>
        ) : null}

        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={[styles.headCell, styles.colFuel, { textAlign: 'left' }]}>YAKIT</Text>
            <Text style={[styles.headCell, styles.colCode]}>H.KODU</Text>
            <Text style={[styles.headCell, styles.colMeter]}>M.SAYAÇ</Text>
            <Text style={[styles.headCell, styles.colMeter]}>E.SAYAÇ</Text>
          </View>
          {HOSES.map((h, i) => {
            const d = meters[h.kod];
            const prev = prevMeters[h.kod];
            return (
              <View key={h.kod} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                <Text style={[styles.fuel, styles.colFuel, { color: FUEL_COLORS[h.tur] }]}>
                  {h.yakit}
                </Text>
                <Text style={[styles.code, styles.colCode]}>{h.kod}</Text>
                {(['m', 'e'] as const).map((field) => {
                  const cur = parseOptional(d[field]);
                  const before = prev?.[field] ?? null;
                  const diff = typeof cur === 'number' && before !== null ? cur - before : null;
                  return (
                    <View key={field} style={styles.colMeter}>
                      <TextInput
                        value={d[field]}
                        onChangeText={(t) => setMeter(h.kod, field, t)}
                        editable={canEdit}
                        keyboardType="decimal-pad"
                        placeholder={before !== null ? formatQty(before) : ''}
                        placeholderTextColor={colors.border}
                        style={[styles.input, cur === undefined && styles.inputInvalid]}
                      />
                      {diff !== null ? (
                        <Text style={[styles.diff, diff < 0 && { color: colors.danger }]}>
                          {diff >= 0 ? '+' : ''}
                          {formatQty(diff)}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            );
          })}
          <View style={[styles.row, styles.oilRow]}>
            <Text style={[styles.fuel, styles.colFuel]}>YAĞ SATIŞI</Text>
            <Text style={[styles.oilHint, styles.colCode]}>1. sayfa</Text>
            <Text style={styles.oilValue}>{formatMoney(oilRevenue)}</Text>
          </View>
        </View>
        <Text style={styles.hint}>
          Gri yazı bir önceki nöbetin okumasıdır; girdiğin değerin altında aradaki fark görünür.
        </Text>

        <View style={styles.table}>
          {SUMMARY_FIELDS.map((f, i) => (
            <View key={f.key} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
              <Text style={[styles.fuel, { flex: 1 }]}>{f.label}</Text>
              <TextInput
                value={summary[f.key]}
                onChangeText={(t) => {
                  setDirty(true);
                  setSummary((prev) => ({ ...prev, [f.key]: t }));
                }}
                editable={canEdit}
                keyboardType="decimal-pad"
                style={[
                  styles.input,
                  styles.summaryInput,
                  parseOptional(summary[f.key]) === undefined && styles.inputInvalid,
                ]}
              />
            </View>
          ))}
        </View>

        <View style={styles.table}>
          <View style={styles.headRow}>
            {pmp.map((_, c) => (
              <Text key={c} style={[styles.headCell, { flex: 1 }]}>
                PMP{c + 1}
              </Text>
            ))}
          </View>
          {Array.from({ length: PMP_ROWS }, (_, r) => (
            <View key={r} style={[styles.row, r % 2 === 1 && styles.rowAlt]}>
              {pmp.map((col, c) => (
                <TextInput
                  key={c}
                  value={col[r]}
                  onChangeText={(t) => setPmpCell(c, r, t)}
                  editable={canEdit}
                  keyboardType="decimal-pad"
                  style={[
                    styles.input,
                    { flex: 1 },
                    parseOptional(col[r]) === undefined && styles.inputInvalid,
                  ]}
                />
              ))}
            </View>
          ))}
          <View style={[styles.row, styles.oilRow]}>
            {pmpTotals.map((t, c) => (
              <Text key={c} style={[styles.pmpTotal, { flex: 1 }]}>
                {t !== 0 ? formatQty(t) : '–'}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={[styles.headCell, { flex: 2, textAlign: 'left' }]}>AÇIKLAMA</Text>
            <Text style={[styles.headCell, { flex: 1 }]}>TUTAR</Text>
          </View>
          {serbest.map((s, i) => (
            <View key={i} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
              <TextInput
                value={s.aciklama}
                onChangeText={(t) => setSerbestCell(i, 'aciklama', t)}
                editable={canEdit}
                style={[styles.input, { flex: 2, textAlign: 'left' }]}
              />
              <TextInput
                value={s.tutar}
                onChangeText={(t) => setSerbestCell(i, 'tutar', t)}
                editable={canEdit}
                keyboardType="decimal-pad"
                style={[
                  styles.input,
                  { flex: 1 },
                  parseOptional(s.tutar) === undefined && styles.inputInvalid,
                ]}
              />
            </View>
          ))}
          {canEdit ? (
            <Pressable
              style={styles.addRow}
              onPress={() => {
                feedback.press();
                setSerbest((prev) => [...prev, { aciklama: '', tutar: '' }]);
              }}
            >
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={styles.addRowText}>Satır ekle</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      {canEdit ? (
        <View style={styles.saveBar}>
          <Button
            title={dirty ? '2. Sayfayı Kaydet' : 'Kaydedildi'}
            icon={dirty ? 'save-outline' : 'checkmark'}
            variant="success"
            onPress={save}
            loading={busy}
            disabled={!dirty}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 10,
    paddingBottom: 16,
    gap: 12,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  warn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.card,
  },
  warnText: {
    flex: 1,
    fontSize: 13,
    color: colors.warning,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: colors.primarySoft,
  },
  headCell: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryDark,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowAlt: {
    backgroundColor: colors.bg,
  },
  colFuel: {
    width: 84,
  },
  colCode: {
    width: 58,
  },
  colMeter: {
    flex: 1,
    minWidth: 0,
  },
  fuel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  code: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
    textAlign: 'center',
  },
  input: {
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 6,
    paddingVertical: 0,
    fontSize: 13,
    color: colors.text,
    textAlign: 'right',
    minWidth: 0,
  },
  inputInvalid: {
    borderColor: colors.danger,
  },
  summaryInput: {
    width: 140,
  },
  diff: {
    fontSize: 10,
    color: colors.success,
    textAlign: 'right',
    marginTop: 1,
  },
  oilRow: {
    backgroundColor: colors.primarySoft,
  },
  oilHint: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  oilValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: colors.success,
    textAlign: 'right',
  },
  pmpTotal: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: -6,
    paddingHorizontal: 4,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addRowText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  saveBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
});
