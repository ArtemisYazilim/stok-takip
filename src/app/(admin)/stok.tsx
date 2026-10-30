import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AdminPompa } from '@/components/cizelge/admin-pompa';
import { StokTablosu } from '@/components/stok-tablosu';
import { Button, EmptyState, Screen, colors } from '@/components/ui';
import { VardiyaDefteri } from '@/components/vardiya-defteri';
import { feedback } from '@/lib/feedback';
import { formatDateKey, formatMoney, toDateKey } from '@/lib/format';
import { liveOilRows, loadOilSheet, loadProducts, type OilRow } from '@/lib/nobet-stok';
import { supabase } from '@/lib/supabase';
import type { Shift } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

/** Bu genişlikten itibaren kağıttaki gibi stok solda, vardiyalar sağda. */
const WIDE = 900;

export default function AdminStockScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const [pane, setPane] = useState<'stok' | 'vardiya'>('stok');
  // Kağıttaki gibi: 1. sayfa yağ satışı + vardiyalar, 2. sayfa o nöbetin pompa sayaçları.
  const [page, setPage] = useState<1 | 2>(1);
  const [shift, setShift] = useState<Shift | null>(null);
  const [rows, setRows] = useState<OilRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // Sütunlar o anki nöbete göre: aynı anda birden çok açık nöbet varsa en
    // son başlayan. Kimse nöbette değilse sadece raf ve depo stoku.
    const { data } = await supabase
      .from('shifts')
      .select('*, profiles(full_name)')
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1);
    const open = ((data as Shift[]) ?? [])[0] ?? null;
    setRows(open ? (await loadOilSheet(open)).rows : liveOilRows(await loadProducts()));
    setShift(open);
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

  // Değer raf + depo toplamıdır: depodaki ürün de işletmenin malıdır.
  const totalValue = rows.reduce(
    (sum, r) => sum + (r.product.stock + r.product.depot_stock) * r.product.sale_price,
    0,
  );

  const stockPane = (
    <View style={styles.pane}>
      <StokTablosu
        rows={rows}
        showDepot
        onPressRow={(r) => router.push({ pathname: '/(admin)/urun', params: { id: r.product.id } })}
        refreshing={refreshing}
        onRefresh={onRefresh}
        bottomInset={70}
        emptyText="Henüz ürün yok. Aşağıdan ekleyin."
      />
      <View style={styles.fabWrap}>
        <Button
          title="Excel'den Aktar"
          icon="document-text-outline"
          variant="ghost"
          onPress={() => router.push('/(admin)/aktar')}
          style={styles.importBtn}
        />
        <Button title="+ Yeni Ürün" onPress={() => router.push('/(admin)/urun')} style={{ flex: 1 }} />
      </View>
    </View>
  );

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{page === 1 ? 'Stok' : 'Pompa Sayaçları'}</Text>
          {page === 1 ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {rows.length} ürün · toplam değer {formatMoney(totalValue)} ·{' '}
              {shift
                ? `nöbette: ${shift.profiles?.full_name || '—'} (${formatDateKey(toDateKey(shift.started_at))})`
                : 'açık nöbet yok'}
            </Text>
          ) : null}
        </View>
        <View style={styles.pageSwitch}>
          {([1, 2] as const).map((n) => {
            const active = page === n;
            return (
              <Pressable
                key={n}
                onPress={() => {
                  feedback.press();
                  setPage(n);
                }}
                style={[styles.pageTab, active && styles.pageTabActive]}
              >
                <Text style={[styles.pageTabText, active && styles.pageTabTextActive]}>{n}. Sayfa</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={signOut} hitSlop={8}>
          <Ionicons name="log-out-outline" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* 1. sayfa bağlı kalır: 2. sayfadan dönünce seçilen gün ve filtre kaybolmasın. */}
      <View style={[styles.pane, page !== 1 && styles.hidden]}>
        {wide ? (
          <View style={styles.columns}>
            <View style={styles.left}>{stockPane}</View>
            <View style={styles.right}>
              <Text style={styles.rightTitle}>Vardiyalar</Text>
              <VardiyaDefteri />
            </View>
          </View>
        ) : (
          <>
            <View style={styles.paneTabs}>
              {(['stok', 'vardiya'] as const).map((p) => {
                const active = pane === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => {
                      feedback.press();
                      setPane(p);
                    }}
                    style={[styles.paneTab, active && styles.paneTabActive]}
                  >
                    <Text style={[styles.paneTabText, active && styles.paneTabTextActive]}>
                      {p === 'stok' ? 'Stok' : 'Vardiyalar'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {/* İkisi de bağlı kalır: geri dönünce seçilen gün ve filtre kaybolmasın. */}
            <View style={[styles.pane, pane !== 'stok' && styles.hidden]}>{stockPane}</View>
            <View style={[styles.pane, pane !== 'vardiya' && styles.hidden]}>
              <VardiyaDefteri />
            </View>
          </>
        )}
      </View>

      {page === 2 ? (
        shift ? (
          <AdminPompa key={shift.id} shift={shift} />
        ) : (
          <EmptyState text="Şu an açık nöbet yok. Geçmiş nöbetlerin 2. sayfası 1. sayfadaki vardiya bloklarında “2. Sayfa” düğmesiyle açılır." />
        )
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  columns: {
    flex: 1,
    flexDirection: 'row',
  },
  left: {
    flex: 1.2,
  },
  right: {
    flex: 1,
    maxWidth: 560,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  rightTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  pane: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
  pageSwitch: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 2,
  },
  pageTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pageTabActive: {
    backgroundColor: colors.primary,
  },
  pageTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  pageTabTextActive: {
    color: colors.card,
  },
  paneTabs: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  paneTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  paneTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  paneTabText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
  },
  paneTabTextActive: {
    color: colors.card,
  },
  fabWrap: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    left: 16,
    flexDirection: 'row',
    gap: 8,
  },
  importBtn: {
    flex: 1,
    backgroundColor: colors.card,
  },
});
