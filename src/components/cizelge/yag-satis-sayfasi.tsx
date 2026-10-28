import { useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, EmptyState, colors } from '@/components/ui';
import { showAlert } from '@/lib/alerts';
import { feedback } from '@/lib/feedback';
import { formatMoney, formatQty, formatSigned, parseNumberInput } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

/**
 * Kağıttaki yağ satış listesinin bir satırı (bir ürün, bir nöbet).
 * Kağıdın kuralı: DVR = önceki BAK + ÇKN, BAK = DVR − satış; BAK ertesi
 * günün kağıdında önceki stok olarak yazılır. Uygulamada BAK raftaki
 * stoktur, ertesi nöbete kendiliğinden geçer.
 */
export interface OilRow {
  product: Product;
  /** Nöbet başında raftaki stok (önceki nöbetin BAK'ı). */
  onceki: number;
  /** ÇKN: nöbet içinde depodan rafa çıkarılan (depodan çıkış + admin alımı). */
  ckn: number;
  /** Bu nöbetin net satışı (satış − iade); kağıttaki 1 GN / 2.GN. */
  satilan: number;
  /** BAK: nöbet sonundaki (açık nöbette şu anki) raf stoku. */
  kalan: number;
}

/** Kağıdın sağındaki "YAĞ ADI / ADET / FİYAT / TUTAR" dökümünün satırı. */
export interface SoldLine {
  productId: string;
  name: string;
  qty: number;
  revenue: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Hücre metni: boş hücre kağıttaki gibi 0 sayılır; geçersizse null. */
function parseCell(text: string): number | null {
  return text.trim() === '' ? 0 : parseNumberInput(text);
}

function cellText(n: number): string {
  return n === 0 ? '' : String(n);
}

type Field = 'ckn' | 'adet';
type Drafts = Record<string, Partial<Record<Field, string>>>;

interface Props {
  shiftId: string;
  rows: OilRow[];
  sold: SoldLine[];
  revenue: number;
  /** Açık nöbette ve nöbetin sahibiyse ÇKN ve satış girilebilir. */
  editable: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSaved: () => Promise<void>;
}

export function YagSatisSayfasi({
  shiftId,
  rows,
  sold,
  revenue,
  editable,
  refreshing,
  onRefresh,
  onSaved,
}: Props) {
  const { session } = useAuth();
  // Ürün id → hücrede yazan metin. Hücre kağıttaki gibi nöbetin toplamını
  // gösterir; kaydedilince sadece kayıtlı değerle farkı hareket olarak yazılır.
  const [drafts, setDrafts] = useState<Drafts>({});
  const [busy, setBusy] = useState(false);

  function setDraft(row: OilRow, field: Field, text: string) {
    const saved = field === 'ckn' ? row.ckn : row.satilan;
    setDrafts((prev) => {
      const cur = { ...prev[row.product.id] };
      if (parseCell(text) === saved) delete cur[field];
      else cur[field] = text;
      const copy = { ...prev };
      if (cur.ckn === undefined && cur.adet === undefined) delete copy[row.product.id];
      else copy[row.product.id] = cur;
      return copy;
    });
  }

  const lines = rows.map((row) => {
    const d = drafts[row.product.id] ?? {};
    const ckn = d.ckn === undefined ? row.ckn : parseCell(d.ckn);
    const adet = d.adet === undefined ? row.satilan : parseCell(d.adet);
    const cknDelta = ckn === null ? 0 : round2(ckn - row.ckn);
    const satDelta = adet === null ? 0 : round2(adet - row.satilan);
    const dvr = round2(row.onceki + row.ckn + cknDelta);
    const bak = round2(row.kalan + cknDelta - satDelta);
    // ÇKN depodan düşer; depo güncel stoktur (kapanmış nöbette gösterilmez).
    const depo = round2(row.product.depot_stock - cknDelta);
    // Kağıtta olmayan değişimler (admin düzeltmesi, başka nöbetin satışı vb.).
    const diger = round2(row.kalan - (row.onceki + row.ckn - row.satilan));
    let error: string | null = null;
    if (ckn === null || adet === null) error = 'Geçerli bir sayı girin';
    else if (ckn < row.ckn) error = 'ÇKN azaltılamaz, admin düzeltir';
    else if (depo < 0) error = `Depoda ${formatQty(row.product.depot_stock)} var`;
    else if (adet < 0) error = 'Satış eksi olamaz';
    else if (bak < 0) error = 'Rafta yeterli ürün yok';
    return {
      row,
      dirty: d.ckn !== undefined || d.adet !== undefined,
      cknText: d.ckn ?? cellText(row.ckn),
      adetText: d.adet ?? cellText(row.satilan),
      ckn: ckn ?? row.ckn,
      adet: adet ?? row.satilan,
      cknDelta,
      satDelta,
      dvr,
      bak,
      depo,
      diger,
      error,
    };
  });

  const pending = lines.filter((l) => l.dirty);
  const pendingCkn = round2(pending.reduce((s, l) => s + l.cknDelta, 0));
  const pendingSat = round2(pending.reduce((s, l) => s + l.satDelta, 0));
  const pendingTotal = pending.reduce((s, l) => s + l.satDelta * l.row.product.sale_price, 0);
  const totals = {
    ckn: round2(lines.reduce((s, l) => s + l.ckn, 0)),
    dvr: round2(lines.reduce((s, l) => s + l.dvr, 0)),
    adet: round2(lines.reduce((s, l) => s + l.adet, 0)),
    bak: round2(lines.reduce((s, l) => s + l.bak, 0)),
  };

  async function save() {
    if (!session) return;
    const bad = pending.find((l) => l.error);
    if (bad) {
      feedback.error();
      showAlert('Hata', `"${bad.row.product.name}": ${bad.error}.`);
      return;
    }
    // ÇKN önce yazılır: aynı kayıtta depodan çıkarılıp satılan ürün için
    // stok tetikleyicisi satıştan önce rafa eklenmiş stoğu görsün.
    const cikis = pending
      .filter((l) => l.cknDelta > 0)
      .map((l) => ({
        product_id: l.row.product.id,
        profile_id: session.user.id,
        shift_id: shiftId,
        type: 'cikis',
        qty: l.cknDelta,
        unit_price: null,
      }));
    // Satış adedi artarsa satış, azalırsa iade yazılır: geçmiş hareketler
    // silinmeden hücre düzeltilmiş olur.
    const sales = pending
      .filter((l) => l.satDelta !== 0)
      .map((l) => ({
        product_id: l.row.product.id,
        profile_id: session.user.id,
        shift_id: shiftId,
        type: l.satDelta > 0 ? 'satis' : 'iade',
        qty: Math.abs(l.satDelta),
        unit_price: l.row.product.sale_price,
      }));
    const movements = [...cikis, ...sales];
    if (movements.length === 0) {
      setDrafts({});
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('stock_movements').insert(movements);
    setBusy(false);
    if (error) {
      feedback.error();
      showAlert('Hata', error.message.includes('Yetersiz stok') ? 'Yetersiz stok!' : error.message);
      await onSaved();
      return;
    }
    if (pendingSat > 0) feedback.sale();
    else feedback.success();
    setDrafts({});
    await onSaved();
  }

  const saveParts = [
    pendingCkn !== 0 ? `ÇKN +${formatQty(pendingCkn)}` : null,
    pendingSat !== 0
      ? `Satış ${pendingSat > 0 ? '+' : ''}${formatQty(pendingSat)} · ${formatMoney(pendingTotal)}`
      : null,
  ].filter(Boolean);

  const header = (
    <View style={styles.headRow}>
      <Text style={[styles.headCell, styles.colName, { textAlign: 'left' }]}>YAĞ ADI</Text>
      <Text style={[styles.headCell, styles.colPrice]}>FİYAT</Text>
      <Text style={[styles.headCell, styles.colNum]}>ÇKN</Text>
      <Text style={[styles.headCell, styles.colNum]}>DVR</Text>
      <Text style={[styles.headCell, styles.colQty]}>SATIŞ</Text>
      <Text style={[styles.headCell, styles.colNum]}>BAK.</Text>
    </View>
  );

  const footer = (
    <View>
      <View style={[styles.row, styles.totalRow]}>
        <Text style={[styles.colName, styles.totalLabel]}>TOPLAM</Text>
        <View style={styles.colPrice} />
        <Text style={[styles.cell, styles.colNum, styles.bold]}>{formatQty(totals.ckn)}</Text>
        <Text style={[styles.cell, styles.colNum, styles.bold]}>{formatQty(totals.dvr)}</Text>
        <Text style={[styles.cell, styles.colQty, styles.bold]}>{formatQty(totals.adet)}</Text>
        <Text style={[styles.cell, styles.colNum, styles.bold]}>{formatQty(totals.bak)}</Text>
      </View>
      <Text style={styles.legend}>
        ÇKN: depodan rafa çıkarılan (depodan düşer) · DVR = önceki BAK + ÇKN · BAK = DVR −
        SATIŞ (ertesi günün kağıdına geçer)
      </Text>

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Bu nöbette satılanlar</Text>
        {sold.length === 0 ? (
          <Text style={styles.muted}>Henüz satış yok.</Text>
        ) : (
          <>
            <View style={styles.sumRow}>
              <Text style={[styles.sumHead, { flex: 1 }]}>YAĞ ADI</Text>
              <Text style={[styles.sumHead, styles.sumQty]}>ADET</Text>
              <Text style={[styles.sumHead, styles.sumPrice]}>FİYAT</Text>
              <Text style={[styles.sumHead, styles.sumTotal]}>TUTAR</Text>
            </View>
            {sold.map((l) => (
              <View key={l.productId} style={styles.sumRow}>
                <Text style={[styles.sumCell, { flex: 1 }]} numberOfLines={1}>
                  {l.name}
                </Text>
                <Text style={[styles.sumCell, styles.sumQty]}>{formatQty(l.qty)}</Text>
                <Text style={[styles.sumCell, styles.sumPrice]}>
                  {formatQty(l.qty !== 0 ? l.revenue / l.qty : 0)}
                </Text>
                <Text style={[styles.sumCell, styles.sumTotal]}>{formatQty(l.revenue)}</Text>
              </View>
            ))}
          </>
        )}
        <View style={[styles.sumRow, styles.sumTotalRow]}>
          <Text style={[styles.sumTotalLabel, { flex: 1 }]}>TOPLAM</Text>
          <Text style={styles.sumTotalValue}>{formatMoney(revenue)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={lines}
        keyExtractor={(l) => l.row.product.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListHeaderComponent={header}
        stickyHeaderIndices={[0]}
        ListEmptyComponent={<EmptyState text="Ürün yok. Admin ürün eklemeli." />}
        ListFooterComponent={footer}
        renderItem={({ item: l, index }) => {
          const p = l.row.product;
          const low = l.bak <= p.min_stock;
          return (
            <View style={[styles.row, index % 2 === 1 && styles.rowAlt, l.dirty && styles.rowChanged]}>
              <View style={styles.colName}>
                <Text style={styles.name} numberOfLines={2}>
                  {p.name}
                </Text>
                {l.error ? (
                  <Text style={styles.error}>{l.error}</Text>
                ) : editable || l.diger !== 0 ? (
                  <Text style={styles.sub}>
                    {editable ? `depo ${formatQty(l.depo)}` : ''}
                    {l.diger !== 0 ? (
                      <Text style={styles.note}>
                        {editable ? ' · ' : ''}diğer: {formatSigned(l.diger)}
                      </Text>
                    ) : null}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.cell, styles.colPrice]}>{formatQty(p.sale_price)}</Text>
              {editable ? (
                <TextInput
                  value={l.cknText}
                  onChangeText={(t) => setDraft(l.row, 'ckn', t)}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  style={[styles.input, styles.colNum, l.error && styles.inputInvalid]}
                />
              ) : (
                <Text style={[styles.cell, styles.colNum]}>{cellText(l.ckn)}</Text>
              )}
              <Text style={[styles.cell, styles.colNum, l.dvr === 0 && styles.zero]}>
                {formatQty(l.dvr)}
              </Text>
              {editable ? (
                <TextInput
                  value={l.adetText}
                  onChangeText={(t) => setDraft(l.row, 'adet', t)}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  style={[styles.input, styles.colQty, styles.bold, l.error && styles.inputInvalid]}
                />
              ) : (
                <Text style={[styles.cell, styles.colQty, styles.bold]}>{cellText(l.adet)}</Text>
              )}
              <Text style={[styles.cell, styles.colNum, low && styles.low]}>{formatQty(l.bak)}</Text>
            </View>
          );
        }}
      />

      {editable && pending.length > 0 ? (
        <View style={styles.saveBar}>
          <Button title="Vazgeç" variant="ghost" onPress={() => setDrafts({})} style={{ flex: 1 }} />
          <Button
            title={saveParts.length > 0 ? `Kaydet · ${saveParts.join(' · ')}` : 'Kaydet'}
            variant="success"
            onPress={save}
            loading={busy}
            style={{ flex: 2.6 }}
          />
        </View>
      ) : (
        <View style={styles.totalBar}>
          <Text style={styles.totalBarLabel}>TOPLAM</Text>
          <Text style={styles.totalBarValue}>{formatMoney(revenue)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 10,
    paddingBottom: 16,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
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
    paddingVertical: 6,
    minHeight: 44,
    backgroundColor: colors.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  rowAlt: {
    backgroundColor: colors.bg,
  },
  rowChanged: {
    backgroundColor: colors.primarySoft,
  },
  totalRow: {
    backgroundColor: colors.primarySoft,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  colName: {
    flex: 1,
    minWidth: 0,
  },
  colPrice: {
    width: 44,
  },
  colNum: {
    width: 38,
  },
  colQty: {
    width: 44,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  sub: {
    fontSize: 11,
    color: colors.textMuted,
  },
  note: {
    fontSize: 11,
    color: colors.warning,
  },
  error: {
    fontSize: 11,
    color: colors.danger,
  },
  cell: {
    fontSize: 13,
    color: colors.text,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  bold: {
    fontWeight: '700',
  },
  zero: {
    color: colors.textMuted,
  },
  low: {
    color: colors.danger,
    fontWeight: '700',
  },
  input: {
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    textAlign: 'center',
    fontSize: 14,
    color: colors.text,
    padding: 0,
  },
  inputInvalid: {
    borderColor: colors.danger,
    color: colors.danger,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  legend: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
    paddingHorizontal: 4,
    lineHeight: 15,
  },
  summary: {
    marginTop: 14,
    padding: 12,
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  muted: {
    fontSize: 13,
    color: colors.textMuted,
  },
  sumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sumHead: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
  },
  sumCell: {
    fontSize: 13,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  sumQty: {
    width: 40,
    textAlign: 'right',
  },
  sumPrice: {
    width: 56,
    textAlign: 'right',
  },
  sumTotal: {
    width: 72,
    textAlign: 'right',
  },
  sumTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 4,
  },
  sumTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  sumTotalValue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.success,
  },
  saveBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  totalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  totalBarLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textMuted,
  },
  totalBarValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.success,
  },
});
