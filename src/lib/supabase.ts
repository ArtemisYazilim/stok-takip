import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

/**
 * Yeni çalışan hesabı açmak için geçici istemci: signUp mevcut admin
 * oturumunu ezmesin diye oturum saklamayan ayrı bir client kullanılır.
 */
export function createTempAuthClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Çalışanlar kullanıcı adıyla girer; e-posta alanına bu sahte alan adı eklenir. */
export const USERNAME_EMAIL_DOMAIN = 'personel.local';

export function toLoginEmail(input: string): string {
  const trimmed = input.trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : `${trimmed}@${USERNAME_EMAIL_DOMAIN}`;
}
