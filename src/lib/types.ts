export type Role = 'admin' | 'calisan';

export type MovementType = 'satis' | 'alim' | 'duzeltme' | 'iade';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  active: boolean;
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

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  satis: 'Satış',
  alim: 'Alım',
  duzeltme: 'Düzeltme',
  iade: 'İade',
};
