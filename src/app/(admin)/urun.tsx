import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Card, Input, ProductThumb, Screen, SectionTitle, colors } from '@/components/ui';
import { confirmAction, showAlert } from '@/lib/alerts';
import { feedback } from '@/lib/feedback';
import { formatQty, parseNumberInput } from '@/lib/format';
import { PRODUCT_IMAGE_BUCKET, uploadProductImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

type StockPlace = 'raf' | 'depo';

const PLACE_OPTIONS: { v: StockPlace; label: string }[] = [
  { v: 'depo', label: 'Depo' },
  { v: 'raf', label: 'Raf (dışarısı)' },
];

/** İki seçenekli düğme grubu (depo / raf). */
function PlaceSegment({ value, onChange }: { value: StockPlace; onChange: (v: StockPlace) => void }) {
  return (
    <View style={styles.segment}>
      {PLACE_OPTIONS.map((o) => {
        const active = o.v === value;
        return (
          <Pressable
            key={o.v}
            onPress={() => {
              feedback.press();
              onChange(o.v);
            }}
            style={[styles.segBtn, active && styles.segBtnActive]}
          >
            <Text style={[styles.segText, active && styles.segTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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
  const [initialDepot, setInitialDepot] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const [restockQty, setRestockQty] = useState('');
  // Satın alınan ürün normalde depoya girer; doğrudan rafa da konabilir.
  const [restockPlace, setRestockPlace] = useState<StockPlace>('depo');
  const [moveQty, setMoveQty] = useState('');
  const [adjustPlace, setAdjustPlace] = useState<StockPlace>('raf');
  const [returnQty, setReturnQty] = useState('');
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
        const depotNum = parseNumberInput(initialDepot) ?? 0;
        const { data, error } = await supabase
          .from('products')
          .insert({ name: name.trim(), sale_price: priceNum, min_stock: minNum })
          .select()
          .single();
        if (error) throw error;
        productId = (data as Product).id;
        const opening = [
          { type: 'alim', qty: stockNum },
          { type: 'depo_alim', qty: depotNum },
        ].filter((o) => o.qty > 0);
        if (opening.length > 0 && session) {
          await supabase.from('stock_movements').insert(
            opening.map((o) => ({
              product_id: productId,
              profile_id: session.user.id,
              type: o.type,
              qty: o.qty,
              note: 'Açılış stoku',
            })),
          );
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
      type: restockPlace === 'depo' ? 'depo_alim' : 'alim',
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

  async function handleMove() {
    const qty = parseNumberInput(moveQty);
    if (!qty || qty <= 0 || !id || !session) {
      showAlert('Hata', 'Geçerli bir miktar girin.');
      return;
    }
    setBusy(true);
    // Pompacının çizelgedeki ÇKN'siyle aynı hareket: depo −, raf +.
    const { error } = await supabase.from('stock_movements').insert({
      product_id: id,
      profile_id: session.user.id,
      type: 'cikis',
      qty,
    });
    setBusy(false);
    if (error) {
      feedback.error();
      showAlert('Hata', error.message);
      return;
    }
    feedback.success();
    setMoveQty('');
    router.back();
  }

  async function handleReturn() {
    const qty = parseNumberInput(returnQty);
    if (!qty || qty <= 0 || !id || !session) {
      showAlert('Hata', 'Geçerli bir miktar girin.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('stock_movements').insert({
      product_id: id,
      profile_id: session.user.id,
      type: 'iade',
      qty,
      note: 'Müşteri iadesi',
    });
    setBusy(false);
    if (error) {
      feedback.error();
      showAlert('Hata', error.message);
      return;
    }
    feedback.success();
    setReturnQty('');
    router.back();
  }

  async function handleAdjust() {
    const target = parseNumberInput(adjustTarget);
    if (target === null || target < 0 || !id || !product || !session) {
      showAlert('Hata', 'Geçerli bir stok değeri girin.');
      return;
    }
    const current = adjustPlace === 'raf' ? product.stock : product.depot_stock;
    const delta = target - current;
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
      delta: adjustPlace === 'raf' ? delta : 0,
      depot_delta: adjustPlace === 'depo' ? delta : 0,
      note: `Elle düzeltme (${adjustPlace}): ${formatQty(current)} → ${formatQty(target)}`,
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
            <>
              <Input
                label="Açılış stoku · raf (dışarıdaki)"
                value={initialStock}
                onChangeText={setInitialStock}
                keyboardType="decimal-pad"
                placeholder="0"
              />
              <Input
                label="Açılış stoku · depo"
                value={initialDepot}
                onChangeText={setInitialDepot}
                keyboardType="decimal-pad"
                placeholder="0"
              />
            </>
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
              <SectionTitle text="Alım Ekle" />
              <Text style={styles.hint}>
                Raf {formatQty(product.stock)} · Depo {formatQty(product.depot_stock)}. Satın alınan
                ürün normalde depoya girer; pompacı ÇKN ile rafa çıkarır.
              </Text>
              <PlaceSegment value={restockPlace} onChange={setRestockPlace} />
              <Input
                label="Alınan miktar"
                value={restockQty}
                onChangeText={setRestockQty}
                keyboardType="decimal-pad"
                placeholder="ör. 12"
              />
              <Button
                title={restockPlace === 'depo' ? 'Depoya Ekle' : 'Rafa Ekle'}
                variant="success"
                onPress={handleRestock}
                loading={busy}
              />
            </Card>

            <Card style={{ gap: 12 }}>
              <SectionTitle text="Depodan Rafa Çıkar" />
              <Text style={styles.hint}>
                Çizelgedeki ÇKN ile aynıdır: depodan düşer, rafa eklenir. Depoda yoksa kabul edilmez.
              </Text>
              <Input
                label="Çıkarılan miktar"
                value={moveQty}
                onChangeText={setMoveQty}
                keyboardType="decimal-pad"
                placeholder="ör. 24"
              />
              <Button title="Rafa Çıkar" onPress={handleMove} loading={busy} />
            </Card>

            <Card style={{ gap: 12 }}>
              <SectionTitle text="İade Al" />
              <Text style={styles.hint}>
                Müşteri satılan ürünü geri getirdiyse miktarı girin; stok iade hareketiyle artar.
              </Text>
              <Input
                label="İade miktarı"
                value={returnQty}
                onChangeText={setReturnQty}
                keyboardType="decimal-pad"
                placeholder="ör. 1"
              />
              <Button title="İadeyi Kaydet" onPress={handleReturn} loading={busy} />
            </Card>

            <Card style={{ gap: 12 }}>
              <SectionTitle text="Stok Düzeltme" />
              <Text style={styles.hint}>
                Sayım sonrası gerçek stoku girin; fark hareket olarak kaydedilir.
              </Text>
              <PlaceSegment value={adjustPlace} onChange={setAdjustPlace} />
              <Input
                label={adjustPlace === 'raf' ? 'Raftaki gerçek stok' : 'Depodaki gerçek stok'}
                value={adjustTarget}
                onChangeText={setAdjustTarget}
                keyboardType="decimal-pad"
                placeholder={formatQty(adjustPlace === 'raf' ? product.stock : product.depot_stock)}
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
  segment: {
    flexDirection: 'row',
    gap: 8,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  segBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
  },
  segTextActive: {
    color: '#fff',
  },
});
