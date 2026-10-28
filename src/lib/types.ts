export type Role = 'admin' | 'calisan';

/** cikis = depodan dışarıdaki rafa çıkarılan (kağıttaki ÇKN), stoğu artırır. */
export type MovementType = 'satis' | 'alim' | 'duzeltme' | 'iade' | 'cikis';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  active: boolean;
  can_open_shift: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  unit: string;
  sale_price: number;
  stock: number;
  min_stock: number;
  active: boolean;
  image_url: string | null;
  created_at: string;
}

export type NotificationType = 'shift_ok' | 'shift_diff';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  shift_id: string | null;
  has_diff: boolean;
  read: boolean;
  created_at: string;
}

export interface Shift {
  id: string;
  profile_id: string;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'full_name'>;
}

export interface Note {
  id: string;
  profile_id: string;
  body: string;
  created_at: string;
  profiles?: Pick<Profile, 'full_name'>;
}

export interface StockMovement {
  id: string;
  product_id: string;
  profile_id: string;
  shift_id: string | null;
  type: MovementType;
  qty: number;
  delta: number;
  unit_price: number | null;
  note: string | null;
  created_at: string;
  products?: Pick<Product, 'name' | 'unit'>;
  profiles?: Pick<Profile, 'full_name'>;
}

export interface ShiftCount {
  id: string;
  shift_id: string;
  product_id: string;
  expected_qty: number;
  counted_qty: number;
  created_at: string;
  products?: Pick<Product, 'name' | 'unit'>;
}

/** Bir hortumun sayaç okuması: m = mekanik sayaç, e = elektronik sayaç. */
export interface MeterReading {
  m: number | null;
  e: number | null;
}

/** Kağıttaki "2. sayfa"nın sayaç tablosu dışındaki alanları. */
export interface ShiftSheetExtras {
  otomasyon_tl?: number | null;
  otomasyon_lt?: number | null;
  gun_sonu_1?: number | null;
  gun_sonu_2?: number | null;
  gun_sonu_3?: number | null;
  /** PMP1..PMP5 sütunları, her sütunda kağıttaki gibi 3 satır. */
  pmp?: (number | null)[][];
  /** Sayfanın solundaki boş satırlar (açıklama + tutar). */
  serbest?: { aciklama: string; tutar: number | null }[];
}

/** Nöbet çizelgesi; anahtar vardiya id'si (bkz. migrations/*_gun_cizelgesi.sql). */
export interface ShiftSheet {
  shift_id: string;
  /** Hortum kodu → okuma (kodlar src/lib/pompa.ts'te). */
  meters: Record<string, MeterReading>;
  extras: ShiftSheetExtras;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  satis: 'Satış',
  alim: 'Alım',
  duzeltme: 'Düzeltme',
  iade: 'İade',
  cikis: 'Depodan Çıkış',
};
