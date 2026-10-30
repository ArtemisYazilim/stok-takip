import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, EmptyState, colors } from '@/components/ui';
import { ZamanFiltresi, bugun, zamanAraligi, zamanEtiketi, type ZamanSecimi } from '@/components/zaman-filtresi';
import { feedback } from '@/lib/feedback';
import { formatDateKey, formatMoney, formatQty, formatTime, toDateKey } from '@/lib/format';
import { loadShiftLog, type ShiftBlock, type ShiftLog } from '@/lib/vardiya-defteri';

/**
 * Admin stok ekranının sağı: kağıdın sağındaki "POMPACI ADI / YAĞ ADI /
 * ADET / FİYAT / TUTAR" blokları, gün yerine nöbet başına alt alta.
 * Üstte zaman filtresi ve o zamanda hangi yağdan ne kadar satıldığı;
 * ürüne dokununca sadece o ürünü satan nöbetler kalır.
 */
export function VardiyaDefteri() {
  const router = useRouter();
  const [zaman, setZaman] = useState<ZamanSecimi>(bugun);
  const [log, setLog] = useState<ShiftLog | null>(null);
  const [product, setProduct] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const blocksY = useRef(0);
  // Gün okları hızlı basılınca geç dönen eski cevap yenisini ezmesin.
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    const { from, to } = zamanAraligi(zaman);
    const result = await loadShiftLog(from, to);
    if (id === request.current) setLog(result);
  }, [zaman]);

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

  function changeZaman(z: ZamanSecimi) {
    setZaman(z);
    setProduct(null);
    setLog(null);
  }

  function pickProduct(id: string) {
    feedback.press();
    if (product === id) {
      setProduct(null);
      return;
    }
    setProduct(id);
    // Seçilen ürünün satıldığı nöbetler aşağıda; oraya kaydırılır.
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: blocksY.current, animated: true }));
  }

  const selected = log?.products.find((p) => p.productId === product) ?? null;
  const blocks = (log?.blocks ?? []).filter((b) => !selected || selected.shiftIds.includes(b.shift.id));
  // Tek günde kağıttaki gibi sabah nöbeti üstte; aralıkta en yeni üstte.
  const ordered = zaman.tur === 'gun' ? [...blocks].reverse() : blocks;

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <ZamanFiltresi value={zaman} onChange={changeZaman} />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Satılan ürünler · {zamanEtiketi(zaman)}</Text>
        {log === null ? (
          <Text style={styles.muted}>Yükleniyor…</Text>
        ) : log.products.length === 0 ? (
          <Text style={styles.muted}>Bu zamanda satış yok.</Text>
        ) : (
          <>
            <View style={styles.tRow}>
              <Text style={[styles.tHead, styles.cName]}>YAĞ ADI</Text>
              <Text style={[styles.tHead, styles.cQty]}>ADET</Text>
              <Text style={[styles.tHead, styles.cTotal]}>TUTAR</Text>
              <View style={styles.cIcon} />
            </View>
            {log.products.map((p) => {
              const active = p.productId === product;
              return (
                <Pressable
                  key={p.productId}
                  onPress={() => pickProduct(p.productId)}
                  style={({ pressed }) => [styles.tRow, styles.pRow, (active || pressed) && styles.pRowActive]}
                >
                  <Text style={[styles.tCell, styles.cName, active && styles.bold]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={[styles.tCell, styles.cQty, styles.bold]}>{formatQty(p.qty)}</Text>
                  <Text style={[styles.tCell, styles.cTotal]}>{formatQty(p.revenue)}</Text>
                  <Ionicons
                    name={active ? 'close' : 'chevron-forward'}
                    size={14}
                    color={active ? colors.primary : colors.textMuted}
                    style={styles.cIcon}
                  />
                </Pressable>
              );
            })}
          </>
        )}
        <View style={[styles.tRow, styles.totalRow]}>
          <Text style={[styles.totalLabel, { flex: 1 }]}>TOPLAM</Text>
          <Text style={styles.totalValue}>{formatMoney(log?.revenue ?? 0)}</Text>
        </View>
        {log && log.products.length > 0 ? (
          <Text style={styles.hint}>Ürüne dokununca o ürünün satıldığı vardiyalar listelenir.</Text>
        ) : null}
      </View>

      <View
        onLayout={(e) => {
          blocksY.current = e.nativeEvent.layout.y;
        }}
        style={styles.blocks}
      >
        {selected ? (
          <Pressable onPress={() => pickProduct(selected.productId)} style={styles.filterTag}>
            <Text style={styles.filterText} numberOfLines={2}>
              {selected.name}: {formatQty(selected.qty)} adet · {selected.shiftIds.length} vardiya
            </Text>
            <Ionicons name="close-circle" size={18} color={colors.primary} />
          </Pressable>
        ) : null}

        {log !== null && ordered.length === 0 ? (
          <EmptyState text="Bu zamanda vardiya yok." />
        ) : (
          ordered.map((b) => (
            <VardiyaBlogu
              key={b.shift.id}
              block={b}
              highlight={product}
              onPress={() => {
                feedback.press();
                router.push({ pathname: '/(admin)/vardiya-detay', params: { id: b.shift.id } });
              }}
              onPompa={() => {
                feedback.press();
                router.push({ pathname: '/(admin)/pompa', params: { id: b.shift.id } });
              }}
            />
          ))
        )}
        {log?.capped ? <Text style={styles.hint}>Son 100 vardiya gösteriliyor.</Text> : null}
      </View>
    </ScrollView>
  );
}

function VardiyaBlogu({
  block,
  highlight,
  onPress,
  onPompa,
}: {
  block: ShiftBlock;
  highlight: string | null;
  onPress: () => void;
  onPompa: () => void;
}) {
  const { shift, sold, ckn, revenue } = block;
  const open = !shift.ended_at;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.block, pressed && styles.blockPressed]}>
      <View style={styles.headLine}>
        <Text style={styles.headLabel}>POMPACI ADI</Text>
        <Text style={styles.headName} numberOfLines={1}>
          {(shift.profiles?.full_name || 'Çalışan').toLocaleUpperCase('tr-TR')}
        </Text>
        <Badge text={open ? 'Açık' : 'Kapandı'} color={open ? colors.success : colors.textMuted} />
      </View>
      <View style={styles.headLine}>
        <Text style={styles.headLabel}>TARİH</Text>
        <Text style={styles.headDate} numberOfLines={1}>
          {formatDateKey(toDateKey(shift.started_at))} · {formatTime(shift.started_at)}–
          {shift.ended_at ? formatTime(shift.ended_at) : 'sürüyor'}
        </Text>
        <Pressable onPress={onPompa} hitSlop={8} style={styles.pompaLink}>
          <Ionicons name="speedometer-outline" size={14} color={colors.primary} />
          <Text style={styles.pompaText}>2. Sayfa</Text>
        </Pressable>
      </View>

      <View style={[styles.tRow, styles.blockHeadRow]}>
        <Text style={[styles.tHead, styles.cName]}>YAĞ ADI</Text>
        <Text style={[styles.tHead, styles.cQty]}>ADET</Text>
        <Text style={[styles.tHead, styles.cPrice]}>FİYAT</Text>
        <Text style={[styles.tHead, styles.cTotal]}>TUTAR</Text>
      </View>
      {sold.length === 0 ? (
        <Text style={[styles.muted, styles.blockEmpty]}>Satış yok.</Text>
      ) : (
        sold.map((l) => {
          const hit = l.productId === highlight;
          return (
            <View key={l.productId} style={[styles.tRow, styles.lineRow, hit && styles.lineHit]}>
              <Text style={[styles.tCell, styles.cName, hit && styles.bold]} numberOfLines={1}>
                {l.name}
              </Text>
              <Text style={[styles.tCell, styles.cQty, styles.bold]}>{formatQty(l.qty)}</Text>
              {/* Fiyat satış anındaki birim fiyattır; sonradan değişse de tutar tutar. */}
              <Text style={[styles.tCell, styles.cPrice]}>{formatQty(l.revenue / l.qty)}</Text>
              <Text style={[styles.tCell, styles.cTotal]}>{formatQty(l.revenue)}</Text>
            </View>
          );
        })
      )}
      <View style={[styles.tRow, styles.blockTotal]}>
        <Text style={[styles.totalLabel, { flex: 1 }]}>TOPLAM</Text>
        <Text style={styles.totalValue}>{formatMoney(revenue)}</Text>
      </View>
      {ckn.length > 0 ? (
        <Text style={styles.ckn}>
          <Text style={styles.bold}>ÇKN: </Text>
          {ckn.map((l) => `${l.name} ${formatQty(l.qty)}`).join(' · ')}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 12,
    gap: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    gap: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
  muted: {
    fontSize: 13,
    color: colors.textMuted,
  },
  hint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
  },
  tRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tHead: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.primaryDark,
    textAlign: 'right',
  },
  tCell: {
    fontSize: 12,
    color: colors.text,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  cName: {
    flex: 1,
    minWidth: 0,
    textAlign: 'left',
  },
  cQty: {
    width: 38,
  },
  cPrice: {
    width: 46,
  },
  cTotal: {
    width: 64,
  },
  cIcon: {
    width: 14,
  },
  pRow: {
    minHeight: 30,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  pRowActive: {
    backgroundColor: colors.primarySoft,
  },
  bold: {
    fontWeight: '700',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.success,
  },
  blocks: {
    gap: 10,
  },
  filterTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  filterText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  block: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  blockPressed: {
    borderColor: colors.primary,
  },
  headLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headLabel: {
    width: 84,
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
  },
  headName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  headDate: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  pompaLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
  },
  pompaText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  blockHeadRow: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.primarySoft,
  },
  lineRow: {
    paddingHorizontal: 10,
    minHeight: 26,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lineHit: {
    backgroundColor: colors.primarySoft,
  },
  blockEmpty: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  blockTotal: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.bg,
  },
  ckn: {
    fontSize: 12,
    color: colors.textMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
