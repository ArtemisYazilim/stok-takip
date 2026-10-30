import { supabase } from '@/lib/supabase';
import type { Product, Shift } from '@/lib/types';

/**
 * Kağıttaki yağ satış listesinin bir satırı (bir ürün, bir nöbet).
 * Kağıdın kuralı: DVR = önceki BAK + ÇKN, BAK = DVR − satış; BAK ertesi
 * günün kağıdında önceki stok olarak yazılır. Uygulamada BAK raftaki
 * stoktur, ertesi nöbete kendiliğinden geçer.
 */
export interface OilRow {
  product: Product;
  /** Nöbet başında raftaki stok (önceki nöbetin BAK'ı). */
  onceki: number;
  /** ÇKN: nöbet içinde depodan rafa çıkarılan (depodan çıkış + admin alımı). */
  ckn: number;
  /** Bu nöbetin net satışı (satış − iade); kağıttaki 1 GN / 2.GN. */
  satilan: number;
  /** BAK: nöbet sonundaki (açık nöbette şu anki) raf stoku. */
  kalan: number;
}

/** Kağıdın sağındaki "YAĞ ADI / ADET / FİYAT / TUTAR" dökümünün satırı. */
export interface SoldLine {
  productId: string;
  name: string;
  qty: number;
  revenue: number;
}

export interface OilSheet {
  rows: OilRow[];
  sold: SoldLine[];
  revenue: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface MovementLite {
  product_id: string;
  shift_id: string | null;
  type: string;
  qty: number;
  delta: number;
  unit_price: number | null;
  products?: { name: string } | null;
}

function sumByProduct(rows: { product_id: string; delta: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.product_id, (map.get(r.product_id) ?? 0) + Number(r.delta));
  return map;
}

/** Aktif ürünler, kağıttaki sırayla. */
export async function loadProducts(): Promise<Product[]> {
  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name');
  return (data as Product[]) ?? [];
}

/** Açık nöbet yokken: nöbet içi sütunlar boş, DVR = BAK = raftaki stok. */
export function liveOilRows(products: Product[]): OilRow[] {
  return products.map((p) => ({ product: p, onceki: p.stock, ckn: 0, satilan: 0, kalan: p.stock }));
}

/** Nöbetin yağ satış listesi (1. sayfa) ve satış dökümü. */
export async function loadOilSheet(shift: Pick<Shift, 'id' | 'started_at' | 'ended_at'>): Promise<OilSheet> {
  // Nöbet penceresindeki tüm hareketler (herkesin): nöbet başındaki stok
  // (önceki BAK) için pencere içindeki her stok değişimi geri alınır.
  let movQuery = supabase
    .from('stock_movements')
    .select('product_id, shift_id, type, qty, delta, unit_price, products(name)')
    .gte('created_at', shift.started_at);
  if (shift.ended_at) movQuery = movQuery.lte('created_at', shift.ended_at);

  const [products, movRes] = await Promise.all([loadProducts(), movQuery]);
  const movements = (movRes.data as unknown as MovementLite[]) ?? [];

  // Kapanmış nöbette BAK = kapanıştaki stok. Devir sayımı yapıldıysa sayım
  // anındaki beklenen stok kullanılır; admin sayımsız kapattıysa bugünkü
  // stoktan kapanıştan sonraki hareketler geri alınır.
  let endStock: Map<string, number> | null = null;
  if (shift.ended_at) {
    const { data: counts } = await supabase
      .from('shift_counts')
      .select('product_id, expected_qty')
      .eq('shift_id', shift.id);
    if (counts && counts.length > 0) {
      endStock = new Map(counts.map((c) => [c.product_id as string, Number(c.expected_qty)]));
    } else {
      const { data: after } = await supabase
        .from('stock_movements')
        .select('product_id, delta')
        .gt('created_at', shift.ended_at);
      const afterSum = sumByProduct(after ?? []);
      endStock = new Map(products.map((p) => [p.id, p.stock - (afterSum.get(p.id) ?? 0)]));
    }
  }

  const windowSum = sumByProduct(movements);
  // ÇKN: pencerede rafa giren ürün. Pompacının depodan çıkışı da adminin
  // alımı da kağıtta aynı sütuna yazılır.
  const cknMap = sumByProduct(movements.filter((m) => m.type === 'cikis' || m.type === 'alim'));
  const soldMap = new Map<string, SoldLine>();
  let total = 0;
  for (const m of movements) {
    if (m.shift_id !== shift.id || (m.type !== 'satis' && m.type !== 'iade')) continue;
    const sign = m.type === 'satis' ? 1 : -1;
    const line = soldMap.get(m.product_id) ?? {
      productId: m.product_id,
      name: m.products?.name ?? 'Ürün',
      qty: 0,
      revenue: 0,
    };
    line.qty += sign * Number(m.qty);
    line.revenue += sign * Number(m.qty) * Number(m.unit_price ?? 0);
    total += sign * Number(m.qty) * Number(m.unit_price ?? 0);
    soldMap.set(m.product_id, line);
  }

  return {
    rows: products.map((p) => {
      const kalan = endStock ? (endStock.get(p.id) ?? p.stock) : p.stock;
      return {
        product: p,
        kalan: round2(kalan),
        onceki: round2(kalan - (windowSum.get(p.id) ?? 0)),
        ckn: round2(cknMap.get(p.id) ?? 0),
        satilan: round2(soldMap.get(p.id)?.qty ?? 0),
      };
    }),
    sold: [...soldMap.values()]
      .filter((l) => round2(l.qty) !== 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    revenue: round2(total),
  };
}
