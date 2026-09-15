import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Card, Input, ProductThumb, Screen, SectionTitle, colors } from '@/components/ui';
import { confirmAction, showAlert } from '@/lib/alerts';
import { feedback } from '@/lib/feedback';
import { formatQty, parseNumberInput } from '@/lib/format';
import { PRODUCT_IMAGE_BUCKET, uploadProductImage } from '@/lib/storage';
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
  const [price, setPrice] = useState('');
  const [minStock, setMinStock] = useState('');
  const [initialStock, setInitialStock] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const [restockQty, setRestockQty] = useState('');
  const [adjustTarget, setAdjustTarget] = useState('');

  // Fotoğraf: currentImageUrl kayıtlı URL; photoBase64 yeni seçilen görsel.
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState<string | undefined>();
  const [photoPreviewUri, setPhotoPreviewUri] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  const shownImage = photoPreviewUri ?? (removePhoto ? null : currentImageUrl);
  const hasPhoto = !!shownImage;

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
        setPrice(String(p.sale_price));
        setMinStock(String(p.min_stock));
        setActive(p.active);
        setCurrentImageUrl(p.image_url);
      });
  }, [id]);

  async function pickPhoto(source: 'camera' | 'library') {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(
        'İzin gerekli',
        source === 'camera'
          ? 'Fotoğraf çekmek için kamera izni verin.'
          : 'Fotoğraf seçmek için galeri izni verin.',
      );
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    };
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]?.base64) return;
    const a = res.assets[0];
    setPhotoBase64(a.base64 ?? null);
    setPhotoMime(a.mimeType ?? 'image/jpeg');
    setPhotoPreviewUri(a.uri);
    setRemovePhoto(false);
    feedback.press();
  }

  function clearPhoto() {
    setPhotoBase64(null);
    setPhotoMime(undefined);
    setPhotoPreviewUri(null);
    setRemovePhoto(true);
  }

  async function handleSave() {
    const priceNum = parseNumberInput(price) ?? 0;
    const minNum = parseNumberInput(minStock) ?? 0;
    if (!name.trim()) {
      feedback.error();
      showAlert('Hata', 'Ürün adı gerekli.');
      return;
    }
    setBusy(true);
    try {
      let productId = id ?? null;

      if (isNew) {
        const stockNum = parseNumberInput(initialStock) ?? 0;
        const { data, error } = await supabase
          .from('products')
          .insert({ name: name.trim(), sale_price: priceNum, min_stock: minNum })
          .select()
          .single();
        if (error) throw error;
        productId = (data as Product).id;
        if (stockNum > 0 && session) {
          await supabase.from('stock_movements').insert({
            product_id: productId,
            profile_id: session.user.id,
            type: 'alim',
            qty: stockNum,
            note: 'Açılış stoku',
          });
        }
      } else {
        const { error } = await supabase
          .from('products')
          .update({ name: name.trim(), sale_price: priceNum, min_stock: minNum, active })
          .eq('id', id);
        if (error) throw error;
      }

      // Fotoğraf değişikliğini uygula.
      if (productId && photoBase64) {
        const url = await uploadProductImage(productId, photoBase64, photoMime);
        await supabase.from('products').update({ image_url: url }).eq('id', productId);
      } else if (productId && removePhoto) {
        await supabase.from('products').update({ image_url: null }).eq('id', productId);
      }

      feedback.success();
      router.back();
    } catch (e: any) {
      feedback.error();
      showAlert('Hata', e?.message ?? 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRestock() {
    const qty = parseNumberInput(restockQty);
    if (!qty || qty <= 0 || !id || !session) {
      showAlert('Hata', 'Geçerli bir miktar girin.');
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
      feedback.error();
      showAlert('Hata', error.message);
      return;
    }
    feedback.success();
    setRestockQty('');
    router.back();
  }

  async function handleAdjust() {
    const target = parseNumberInput(adjustTarget);
    if (target === null || target < 0 || !id || !product || !session) {
      showAlert('Hata', 'Geçerli bir stok değeri girin.');
      return;
    }
    const delta = target - product.stock;
    if (delta === 0) {
      showAlert('Bilgi', 'Stok zaten bu değerde.');
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
      feedback.error();
      showAlert('Hata', error.message);
      return;
    }
    feedback.success();
    setAdjustTarget('');
    router.back();
  }

  async function confirmDelete() {
    if (!product || busy) return;
    feedback.warning();
    const onay = await confirmAction(
      'Ürünü Sil',
      `'${product.name}' ürünü ve tüm satış/alım geçmişi kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      'Sil',
    );
    if (onay) await handleDelete();
  }

  async function handleDelete() {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_delete_product', { target_id: id });
    if (!error) {
      // Fotoğrafı Storage'dan kaldır; kova/politika kurulu değilse sessizce geçilir.
      await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([id]);
    }
    setBusy(false);
    if (error) {
      feedback.error();
      showAlert('Hata', error.message);
      return;
    }
    feedback.success();
    router.back();
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{isNew ? 'Yeni Ürün' : 'Ürünü Düzenle'}</Text>

        <Card style={{ gap: 12 }}>
          <View style={styles.photoRow}>
            <ProductThumb uri={shownImage} size={84} />
            <View style={styles.photoActions}>
              <Button
                title="Kamera"
                variant="ghost"
                icon="camera-outline"
                onPress={() => pickPhoto('camera')}
              />
              <Button
                title="Galeriden Seç"
                variant="ghost"
                icon="image-outline"
                onPress={() => pickPhoto('library')}
              />
              {hasPhoto ? (
                <Button title="Fotoğrafı Kaldır" variant="ghost" icon="trash-outline" onPress={clearPhoto} />
              ) : null}
            </View>
          </View>
          <Input label="Ürün adı" value={name} onChangeText={setName} placeholder="ör. Motor Yağı 4L" />
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
              <SectionTitle text={`Alım Ekle (mevcut: ${formatQty(product.stock)})`} />
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

            <Button
              title="Ürünü Sil"
              variant="danger"
              icon="trash-outline"
              onPress={confirmDelete}
              loading={busy}
            />
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
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  photoActions: {
    flex: 1,
    gap: 8,
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
