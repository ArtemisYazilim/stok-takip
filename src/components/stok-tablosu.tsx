import type { ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, colors } from '@/components/ui';
import { formatQty } from '@/lib/format';
import { round2, type OilRow } from '@/lib/nobet-stok';

/** Kağıttaki gibi 0 yazılmaz, hücre boş kalır. */
function cellText(n: number): string {
  return n === 0 ? '' : formatQty(n);
}

interface Props {
  rows: OilRow[];
  /** Admin: kağıtta olmayan DEPO sütunu da görünür. */
  showDepot?: boolean;
  onPressRow?: (row: OilRow) => void;
  refreshing: boolean;
  onRefresh: () => void;
  /** Tablonun altında ek boşluk (ekranın alt düğmeleri için). */
  bottomInset?: number;
  emptyText?: string;
  footer?: ReactElement | null;
}

/**
 * Stok ekranı, kağıttaki yağ satış listesinin sol tablosu gibi: fotoğraf
 * yok, her ürün tek satır. DVR = nöbet başı raf + ÇKN, BAK = raftaki stok.
 */
export function StokTablosu({
  rows,
  showDepot,
  onPressRow,
  refreshing,
  onRefresh,
  bottomInset = 0,
  emptyText = 'Ürün yok.',
  footer,
}: Props) {
  const totals = {
    ckn: round2(rows.reduce((s, r) => s + r.ckn, 0)),
    dvr: round2(rows.reduce((s, r) => s + r.onceki + r.ckn, 0)),
    satis: round2(rows.reduce((s, r) => s + r.satilan, 0)),
    bak: round2(rows.reduce((s, r) => s + r.kalan, 0)),
    depo: round2(rows.reduce((s, r) => s + r.product.depot_stock, 0)),
  };

  const header = (
    <View style={[styles.row, styles.headRow]}>
      <Text style={[styles.head, styles.colName, { textAlign: 'left' }]}>YAĞ ADI</Text>
      <Text style={[styles.head, styles.colPrice]}>FİYAT</Text>
      <Text style={[styles.head, styles.colNum]}>ÇKN</Text>
      <Text style={[styles.head, styles.colNum]}>DVR</Text>
      <Text style={[styles.head, styles.colQty]}>SATIŞ</Text>
      <Text style={[styles.head, styles.colNum]}>BAK.</Text>
      {showDepot ? <Text style={[styles.head, styles.colQty]}>DEPO</Text> : null}
    </View>
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.product.id}
      contentContainerStyle={[styles.list, { paddingBottom: 16 + bottomInset }]}
      refreshing={refreshing}
      onRefresh={onRefresh}
      ListHeaderComponent={header}
      stickyHeaderIndices={[0]}
      ListEmptyComponent={<EmptyState text={emptyText} />}
      ListFooterComponent={
        rows.length > 0 ? (
          <View>
            <View style={[styles.row, styles.totalRow]}>
              <Text style={[styles.colName, styles.totalLabel]}>TOPLAM</Text>
              <View style={styles.colPrice} />
              <Text style={[styles.cell, styles.colNum, styles.bold]}>{cellText(totals.ckn)}</Text>
              <Text style={[styles.cell, styles.colNum, styles.bold]}>{cellText(totals.dvr)}</Text>
              <Text style={[styles.cell, styles.colQty, styles.bold]}>{cellText(totals.satis)}</Text>
              <Text style={[styles.cell, styles.colNum, styles.bold]}>{cellText(totals.bak)}</Text>
              {showDepot ? (
                <Text style={[styles.cell, styles.colQty, styles.bold]}>{cellText(totals.depo)}</Text>
              ) : null}
            </View>
            {footer}
          </View>
        ) : null
      }
      renderItem={({ item: r, index }) => {
        const p = r.product;
        const dvr = round2(r.onceki + r.ckn);
        const low = p.min_stock > 0 && r.kalan <= p.min_stock;
        return (
          <Pressable
            onPress={onPressRow ? () => onPressRow(r) : undefined}
            disabled={!onPressRow}
            style={({ pressed }) => [
              styles.row,
              index % 2 === 1 && styles.rowAlt,
              pressed && styles.rowPressed,
            ]}
          >
            <Text style={[styles.name, styles.colName]} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={[styles.cell, styles.colPrice]}>{formatQty(p.sale_price)}</Text>
            <Text style={[styles.cell, styles.colNum]}>{cellText(r.ckn)}</Text>
            <Text style={[styles.cell, styles.colNum]}>{cellText(dvr)}</Text>
            <Text style={[styles.cell, styles.colQty, styles.bold]}>{cellText(r.satilan)}</Text>
            {/* Az kalan ürün kırmızı; stok sıfırsa da 0 yazılır ki fark edilsin. */}
            <Text style={[styles.cell, styles.colNum, low && styles.low]}>
              {low ? formatQty(r.kalan) : cellText(r.kalan)}
            </Text>
            {showDepot ? (
              <Text style={[styles.cell, styles.colQty, styles.muted]}>{cellText(p.depot_stock)}</Text>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 8,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    minHeight: 32,
    backgroundColor: colors.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  headRow: {
    minHeight: 30,
    backgroundColor: colors.primarySoft,
    borderTopWidth: 1,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  rowAlt: {
    backgroundColor: colors.bg,
  },
  rowPressed: {
    backgroundColor: colors.primarySoft,
  },
  totalRow: {
    backgroundColor: colors.primarySoft,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  colName: {
    flex: 1,
    minWidth: 0,
  },
  colPrice: {
    width: 40,
  },
  colNum: {
    width: 30,
  },
  colQty: {
    width: 36,
  },
  head: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.primaryDark,
    textAlign: 'center',
  },
  name: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  cell: {
    fontSize: 12,
    color: colors.text,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  bold: {
    fontWeight: '700',
  },
  muted: {
    color: colors.textMuted,
  },
  low: {
    color: colors.danger,
    fontWeight: '700',
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
});
