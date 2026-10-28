import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Badge, Button, Card, Screen, SectionTitle, colors } from '@/components/ui';
import { confirmAction, showAlert } from '@/lib/alerts';
import {
  FIELD_LABELS,
  STOCK_SOURCE_LABELS,
  availableStockSources,
  columnLetter,
  defaultStockSource,
  depotFor,
  normalizeKey,
  parseExcelTable,
  stockFor,
  type ImportField,
  type StockSource,
} from '@/lib/excel-aktarim';
import { feedback } from '@/lib/feedback';
import { formatMoney, formatQty } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';

type Status = 'yeni' | 'guncelle' | 'ayni' | 'hata';

const STATUS_LABEL: Record<Status, string> = {
  yeni: 'Yeni',
  guncelle: 'Güncellenecek',
  ayni: 'Aynı',
  hata: 'Hatalı',
};

const STATUS_COLOR: Record<Status, string> = {
  yeni: colors.success,
  guncelle: colors.primary,
  ayni: colors.textMuted,
  hata: colors.danger,
};

export default function ImportScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [source, setSource] = useState<StockSource | null>(null);
  const [depotOn, setDepotOn] = useState(true);
  // Kullanıcının elle açıp kapattığı satırlar (anahtar: normalize ad).
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    // Pasif ürünler de çekilir: Excel'de olan pasif ürün kopyası açılmadan
    // yeniden aktif edilir.
    const { data } = await supabase.from('products').select('*');
    setProducts((data as Product[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const table = text.trim() ? parseExcelTable(text) : null;
  const sources = table ? availableStockSources(table) : [];
  const src: StockSource =
    source && sources.includes(source) ? source : table ? defaultStockSource(table) : 'yok';
  const hasPrice = table?.columns.price !== undefined;
  const hasDepot = table?.columns.depo !== undefined;

  const byKey = new Map(products.map((p) => [normalizeKey(p.name), p]));
  const seen = new Set<string>();
  const rows = (table?.rows ?? []).map((r) => {
    const key = normalizeKey(r.name);
    const match = byKey.get(key) ?? null;
    const price = hasPrice ? r.values.price : null;
    const stock = stockFor(r, src);
    const depot = table && depotOn ? depotFor(r, table) : null;
    const changes: string[] = [];
    let error: string | null = null;
    if (seen.has(key)) error = 'Listede iki kez var';
    else if (price === undefined) error = 'Fiyat hücresi sayı değil';
    else if (stock === undefined) error = 'Stok hücresi sayı değil';
    else if (stock !== null && stock < 0) error = `Stok eksi çıkıyor (${formatQty(stock)})`;
    else if (depot === undefined) error = 'Depo hücresi sayı değil';
    else if (depot !== null && depot < 0) error = 'Depo eksi olamaz';
    seen.add(key);

    let status: Status;
    if (error) status = 'hata';
    else if (!match) status = 'yeni';
    else {
      if (price != null && price !== match.sale_price) {
        changes.push(`fiyat ${formatQty(match.sale_price)} → ${formatQty(price)}`);
      }
      if (stock != null && stock !== match.stock) {
        changes.push(`raf ${formatQty(match.stock)} → ${formatQty(stock)}`);
      }
      if (depot != null && depot !== match.depot_stock) {
        changes.push(`depo ${formatQty(match.depot_stock)} → ${formatQty(depot)}`);
      }
      if (!match.active) changes.push('yeniden listeye alınır');
      status = changes.length > 0 ? 'guncelle' : 'ayni';
    }
    // Fiyatı boş yeni satır çoğunlukla grup başlığıdır (ör. "BERNER ÜRÜNLERİ");
    // varsayılan seçilmez, istenirse elle işaretlenir.
    const defaultOn = status !== 'yeni' || price != null;
    const on = status !== 'hata' && (toggled[key] ?? defaultOn);
    return {
      key,
      r,
      match,
      price: price ?? null,
      stock: stock ?? null,
      depot: depot ?? null,
      changes,
      status,
      error,
      on,
    };
  });

  const count = (s: Status) => rows.filter((x) => x.status === s).length;
  const chosen = rows.filter((x) => x.on);
  const parsedKeys = new Set(rows.map((x) => x.key));
  const notInExcel = products.filter((p) => p.active && !parsedKeys.has(normalizeKey(p.name))).length;

  function clear() {
    feedback.press();
    setText('');
    setToggled({});
    setSource(null);
    setDepotOn(true);
  }

  async function runImport() {
    if (chosen.length === 0) return;
    const newCount = chosen.filter((x) => x.status === 'yeni').length;
    const ok = await confirmAction(
      'Excel aktarımı',
      `${chosen.length} ürün aktarılacak (${newCount} yeni). Stok farkları "Düzeltme" hareketi olarak kayda geçer, hareket geçmişinde görünür.`,
      'Aktar',
    );
    if (!ok) return;
    setBusy(true);
    const items = chosen.map((x) => ({
      id: x.match?.id ?? null,
      name: x.r.name,
      // null: mevcut ürünün fiyatı korunur, yeni üründe 0 olur.
      sale_price: x.price,
      // Kağıttaki satır sırası; çizelge aynı sırayla listeler.
      sort_order: x.r.order,
      // null: stoka dokunulmaz.
      stock: src === 'yok' ? null : x.stock,
      // null: depoya dokunulmaz (Excel'de DEPO sütunu yoksa ya da kapatıldıysa).
      depot: x.depot,
    }));
    const { data, error } = await supabase.rpc('admin_import_products', { items });
    setBusy(false);
    if (error) {
      feedback.error();
      showAlert('Hata', error.message);
      return;
    }
    feedback.success();
    const res = data as { eklenen: number; guncellenen: number; stok_hareketi: number };
    showAlert(
      'Aktarım tamam',
      `${res.eklenen} yeni ürün, ${res.guncellenen} güncelleme, ${res.stok_hareketi} stok düzeltmesi.`,
      () => router.navigate('/(admin)/stok'),
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.navigate('/(admin)/stok')}
          hitSlop={10}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Text style={styles.title}>Excel&apos;den Aktar</Text>
      </View>

      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 8 }}>
          <SectionTitle text="1. Excel'den kopyala" />
          <Text style={styles.hint}>
            Excel&apos;de yağ listesini başlık satırıyla birlikte seç (YAĞ ADI, FİYAT, ÇKN, DVR, 1
            GN, 2.GN, BAK.), Ctrl+C ile kopyala ve aşağıya yapıştır. Depo stoku da aktarılsın
            istenirse Excel&apos;e &quot;DEPO&quot; başlıklı bir sütun ekle. Başlık yoksa A sütunu ad,
            B fiyat, C stok sayılır.
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder="Buraya yapıştır"
            placeholderTextColor={colors.textMuted}
            style={styles.paste}
          />
          {text ? <Button title="Temizle" variant="ghost" onPress={clear} /> : null}
        </Card>

        {table ? (
          <>
            <Card style={{ gap: 8 }}>
              <SectionTitle text="2. Sütunlar ve stok" />
              <Text style={styles.hint}>
                {table.headerFound ? 'Başlık satırı bulundu' : 'Başlık bulunamadı, düz liste varsayıldı'}
                :{' '}
                {(Object.entries(table.columns) as [ImportField, number][])
                  .map(([f, i]) => `${FIELD_LABELS[f]} = ${columnLetter(i)}`)
                  .join(' · ')}
              </Text>
              <Text style={styles.label}>Stok hangi sütundan alınsın?</Text>
              <View style={styles.chips}>
                {sources.map((s) => {
                  const active = src === s;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => {
                        feedback.press();
                        setSource(s);
                      }}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {STOCK_SOURCE_LABELS[s]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.hint}>
                Kağıdın kuralı: DVR = önceki BAK + ÇKN, BAK = DVR − 1 GN − 2.GN. Boş hücre 0
                sayılır. BAK. doluysa o, değilse DVR − satışlar önerilir. Bu, dışarıdaki raf
                stokudur.
              </Text>
              {hasDepot ? (
                <>
                  <Text style={styles.label}>Depo stoku</Text>
                  <View style={styles.chips}>
                    {[
                      { v: true, label: 'DEPO sütunundan al' },
                      { v: false, label: 'Depoya dokunma' },
                    ].map((o) => {
                      const active = depotOn === o.v;
                      return (
                        <Pressable
                          key={o.label}
                          onPress={() => {
                            feedback.press();
                            setDepotOn(o.v);
                          }}
                          style={[styles.chip, active && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {o.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : (
                <Text style={styles.hint}>
                  Tabloda DEPO sütunu yok; depo stokuna dokunulmaz.
                </Text>
              )}
            </Card>

            <Card style={{ gap: 8 }}>
              <SectionTitle text={`3. Önizleme · ${rows.length} satır`} />
              <Text style={styles.hint}>
                {count('yeni')} yeni · {count('guncelle')} güncellenecek · {count('ayni')} aynı ·{' '}
                {count('hata')} hatalı. İşaretsiz satır aktarılmaz; dokunarak aç/kapat.
                {notInExcel > 0 ? ` Excel'de olmayan ${notInExcel} ürüne dokunulmaz.` : ''}
              </Text>
              {rows.map((x) => (
                <Pressable
                  key={x.r.order}
                  disabled={x.status === 'hata'}
                  onPress={() => {
                    feedback.press();
                    setToggled((prev) => ({ ...prev, [x.key]: !x.on }));
                  }}
                  style={[styles.row, !x.on && { opacity: 0.55 }]}
                >
                  <Ionicons
                    name={x.on ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={x.on ? colors.primary : colors.textMuted}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.rowName}>{x.r.name}</Text>
                    <Text style={styles.rowMeta}>
                      {x.price != null ? formatMoney(x.price) : 'fiyat yok'}
                      {x.stock != null ? ` · raf ${formatQty(x.stock)}` : ''}
                      {x.depot != null ? ` · depo ${formatQty(x.depot)}` : ''}
                    </Text>
                    {x.error ? (
                      <Text style={styles.rowError}>{x.error}</Text>
                    ) : x.changes.length > 0 ? (
                      <Text style={styles.rowChange}>{x.changes.join(' · ')}</Text>
                    ) : null}
                  </View>
                  <Badge text={STATUS_LABEL[x.status]} color={STATUS_COLOR[x.status]} />
                </Pressable>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>

      {table ? (
        <View style={styles.footer}>
          <Button
            title={`Aktar · ${chosen.length} ürün`}
            variant="success"
            onPress={runImport}
            loading={busy}
            disabled={chosen.length === 0}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  paste: {
    minHeight: 120,
    maxHeight: 240,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.bg,
    padding: 10,
    fontSize: 13,
    color: colors.text,
    textAlignVertical: 'top',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    color: colors.text,
  },
  chipTextActive: {
    color: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  rowMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  rowChange: {
    fontSize: 12,
    color: colors.primary,
  },
  rowError: {
    fontSize: 12,
    color: colors.danger,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
});
