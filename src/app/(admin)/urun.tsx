import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Card, Input, Screen, SectionTitle, colors } from '@/components/ui';
import { formatQty, parseNumberInput } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

export default function ProductEditScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;

  const [product, setProduct] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('adet');
  const [price, setPrice] = useState('');
  const [minStock, setMinStock] = useState('');
  const [initialStock, setInitialStock] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const [restockQty, setRestockQty] = useState('');
  const [adjustTarget, setAdjustTarget] = useState('');

  useEffect(() => {
    if (!id) return;
    supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const p = data as Product;
        setProduct(p);
        setName(p.name);
        setUnit(p.unit);
        setPrice(String(p.sale_price));
        setMinStock(String(p.min_stock));
        setActive(p.active);
      });
  }, [id]);

  async function handleSave() {
    const priceNum = parseNumberInput(price) ?? 0;
    const minNum = parseNumberInput(minStock) ?? 0;
    if (!name.trim()) {
      Alert.alert('Hata', 'Ürün adı gerekli.');
      return;
    }
    setBusy(true);
    if (isNew) {
      const stockNum = parseNumberInput(initialStock) ?? 0;
      const { data, error } = await supabase
        .from('products')
        .insert({ name: name.trim(), unit: unit.trim() || 'adet', sale_price: priceNum, min_stock: minNum })
        .select()
        .single();
      if (!error && data && stockNum > 0 && session) {
        await supabase.from('stock_movements').insert({
          product_id: (data as Product).id,
          profile_id: session.user.id,
          type: 'alim',
          qty: stockNum,
          note: 'Açılış stoku',
        });
      }
      setBusy(false);
      if (error) {
        Alert.alert('Hata', error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from('products')
        .update({ name: name.trim(), unit: unit.trim() || 'adet', sale_price: priceNum, min_stock: minNum, active })
        .eq('id', id);
      setBusy(false);
      if (error) {
        Alert.alert('Hata', error.message);
        return;
      }
    }
    router.back();
  }

  async function handleRestock() {
    const qty = parseNumberInput(restockQty);
    if (!qty || qty <= 0 || !id || !session) {
      Alert.alert('Hata', 'Geçerli bir miktar girin.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('stock_movements').insert({
      product_id: id,
      profile_id: session.user.id,
      type: 'alim',
      qty,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    setRestockQty('');
    router.back();
  }

  async function handleAdjust() {
    const target = parseNumberInput(adjustTarget);
    if (target === null || target < 0 || !id || !product || !session) {
      Alert.alert('Hata', 'Geçerli bir stok değeri girin.');
      return;
    }
    const delta = target - product.stock;
    if (delta === 0) {
      Alert.alert('Bilgi', 'Stok zaten bu değerde.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('stock_movements').insert({
      product_id: id,
      profile_id: session.user.id,
      type: 'duzeltme',
      qty: Math.abs(delta),
      delta,
      note: `Elle düzeltme: ${formatQty(product.stock)} → ${formatQty(target)}`,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    setAdjustTarget('');
    router.back();
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{isNew ? 'Yeni Ürün' : 'Ürünü Düzenle'}</Text>

        <Card style={{ gap: 12 }}>
          <Input label="Ürün adı" value={name} onChangeText={setName} placeholder="ör. Motor Yağı 4L" />
          <Input label="Birim" value={unit} onChangeText={setUnit} placeholder="adet / litre / bidon" />
          <Input
            label="Satış fiyatı (₺)"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="0,00"
          />
          <Input
            label="Kritik stok uyarı sınırı"
            value={minStock}
            onChangeText={setMinStock}
            keyboardType="decimal-pad"
            placeholder="ör. 3"
          />
          {isNew ? (
            <Input
              label="Açılış stoku"
              value={initialStock}
              onChangeText={setInitialStock}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          ) : (
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Ürün aktif (satışta)</Text>
              <Switch value={active} onValueChange={setActive} />
            </View>
          )}
          <Button title="Kaydet" onPress={handleSave} loading={busy} />
        </Card>

        {!isNew && product ? (
          <>
            <Card style={{ gap: 12 }}>
              <SectionTitle text={`Alım Ekle (mevcut: ${formatQty(product.stock)} ${product.unit})`} />
              <Input
                label="Alınan miktar"
                value={restockQty}
                onChangeText={setRestockQty}
                keyboardType="decimal-pad"
                placeholder="ör. 12"
              />
              <Button title="Stoka Ekle" variant="success" onPress={handleRestock} loading={busy} />
            </Card>

            <Card style={{ gap: 12 }}>
              <SectionTitle text="Stok Düzeltme" />
              <Text style={styles.hint}>
                Sayım sonrası gerçek stoku girin; fark hareket olarak kaydedilir.
              </Text>
              <Input
                label="Gerçek stok"
                value={adjustTarget}
                onChangeText={setAdjustTarget}
                keyboardType="decimal-pad"
                placeholder={formatQty(product.stock)}
              />
              <Button title="Düzelt" variant="danger" onPress={handleAdjust} loading={busy} />
            </Card>
          </>
        ) : null}

        <Button title="Vazgeç" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 16,
    gap: 14,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
