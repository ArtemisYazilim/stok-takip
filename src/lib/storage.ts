import { decode } from 'base64-arraybuffer';

import { supabase } from './supabase';

export const PRODUCT_IMAGE_BUCKET = 'product-images';

/**
 * Ürün fotoğrafını Supabase Storage'a yükler ve herkese açık URL döner.
 * base64, expo-image-picker sonucundan gelir (React Native'de blob güvenilir
 * çalışmadığı için base64 -> ArrayBuffer yolu kullanılır).
 * Her ürün tek bir nesnede tutulur (upsert), URL'e cache kırıcı eklenir.
 */
export async function uploadProductImage(
  productId: string,
  base64: string,
  mimeType?: string,
): Promise<string> {
  const path = productId;
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, decode(base64), {
      contentType: mimeType ?? 'image/jpeg',
      upsert: true,
    });
  if (error) throw error;

  const { data } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}
