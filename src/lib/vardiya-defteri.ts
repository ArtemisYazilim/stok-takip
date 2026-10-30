import { round2, type SoldLine } from '@/lib/nobet-stok';
import { supabase } from '@/lib/supabase';
import type { Shift } from '@/lib/types';

/**
 * Kağıdın sağındaki pompacı bloğu, gün yerine nöbet başına: kim, hangi
 * yağdan kaç adet sattı, depodan rafa ne çıkardı.
 */
export interface ShiftBlock {
  shift: Shift;
  /** Net satış (satış − iade), kağıttaki ürün sırasıyla. */
  sold: SoldLine[];
  revenue: number;
  /** Depodan rafa çıkarılanlar (ÇKN); revenue her zaman 0. */
  ckn: SoldLine[];
}

/** Seçilen zamanda bir ürünün toplam satışı ve satıldığı nöbetler. */
export interface ProductSale extends SoldLine {
  shiftIds: string[];
}

export interface ShiftLog {
  /** En yeni nöbet başta. */
  blocks: ShiftBlock[];
  products: ProductSale[];
  revenue: number;
  /** Nöbet sayısı sınıra takıldı; daha eskiler gösterilmiyor. */
  capped: boolean;
}

const SHIFT_LIMIT = 100;
// PostgREST tek istekte en çok 1000 satır döner; ay boyu satışlar sayfalanır.
const PAGE = 1000;

interface MovementRow {
  product_id: string;
  shift_id: string;
  type: 'satis' | 'iade' | 'cikis';
  qty: number;
  unit_price: number | null;
  products: { name: string; sort_order: number | null } | null;
}

type Acc = Map<string, SoldLine>;

function add(map: Acc, productId: string, name: string, qty: number, revenue: number) {
  const line = map.get(productId) ?? { productId, name, qty: 0, revenue: 0 };
  line.qty += qty;
  line.revenue += revenue;
  map.set(productId, line);
}

/**
 * Nöbet günü, nöbetin başladığı gündür (nöbet seçimiyle aynı kural). Seçim
 * şu anı kapsıyorsa önceki gün başlayıp hâlâ süren nöbet de listeye girer.
 */
export async function loadShiftLog(from: Date | null, to: Date | null): Promise<ShiftLog> {
  let q = supabase
    .from('shifts')
    .select('*, profiles(full_name)')
    .order('started_at', { ascending: false })
    .limit(SHIFT_LIMIT);
  if (from) q = q.gte('started_at', from.toISOString());
  if (to) q = q.lt('started_at', to.toISOString());
  const { data } = await q;
  const shifts = (data as Shift[]) ?? [];
  const capped = shifts.length >= SHIFT_LIMIT;

  const now = Date.now();
  if ((!from || from.getTime() <= now) && (!to || to.getTime() > now)) {
    const { data: open } = await supabase
      .from('shifts')
      .select('*, profiles(full_name)')
      .is('ended_at', null);
    for (const s of (open as Shift[]) ?? []) {
      if (!shifts.some((x) => x.id === s.id)) shifts.push(s);
    }
    shifts.sort((a, b) => b.started_at.localeCompare(a.started_at));
  }

  const rows: MovementRow[] = [];
  const ids = shifts.map((s) => s.id);
  for (let page = 0; ids.length > 0; page++) {
    const { data: part, error } = await supabase
      .from('stock_movements')
      .select('product_id, shift_id, type, qty, unit_price, products(name, sort_order)')
      .in('shift_id', ids)
      .in('type', ['satis', 'iade', 'cikis'])
      .order('created_at')
      .order('id')
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error || !part) break;
    rows.push(...(part as unknown as MovementRow[]));
    if (part.length < PAGE) break;
  }

  const order = new Map<string, { sort: number | null; name: string }>();
  const perShift = new Map(ids.map((id) => [id, { sold: new Map() as Acc, ckn: new Map() as Acc }]));
  for (const m of rows) {
    const acc = perShift.get(m.shift_id);
    if (!acc) continue;
    const name = m.products?.name ?? 'Ürün';
    order.set(m.product_id, { sort: m.products?.sort_order ?? null, name });
    const qty = Number(m.qty);
    if (m.type === 'cikis') {
      add(acc.ckn, m.product_id, name, qty, 0);
    } else {
      const sign = m.type === 'satis' ? 1 : -1;
      add(acc.sold, m.product_id, name, sign * qty, sign * qty * Number(m.unit_price ?? 0));
    }
  }

  // Stok tablosuyla aynı sıra: kağıttaki sıra, sırası olmayanlar sonda adla.
  const byPaper = (a: SoldLine, b: SoldLine) => {
    const sa = order.get(a.productId)?.sort ?? null;
    const sb = order.get(b.productId)?.sort ?? null;
    if (sa !== sb) {
      if (sa === null) return 1;
      if (sb === null) return -1;
      return sa - sb;
    }
    return a.name.localeCompare(b.name, 'tr');
  };
  const finish = (map: Acc) =>
    [...map.values()]
      .map((l) => ({ ...l, qty: round2(l.qty), revenue: round2(l.revenue) }))
      .filter((l) => l.qty !== 0)
      .sort(byPaper);

  const products = new Map<string, ProductSale>();
  const blocks = shifts.map((shift) => {
    const acc = perShift.get(shift.id)!;
    const sold = finish(acc.sold);
    for (const l of sold) {
      const p = products.get(l.productId) ?? { ...l, qty: 0, revenue: 0, shiftIds: [] };
      p.qty += l.qty;
      p.revenue += l.revenue;
      p.shiftIds.push(shift.id);
      products.set(l.productId, p);
    }
    return {
      shift,
      sold,
      revenue: round2(sold.reduce((s, l) => s + l.revenue, 0)),
      ckn: finish(acc.ckn),
    };
  });

  return {
    blocks,
    products: [...products.values()]
      .map((p) => ({ ...p, qty: round2(p.qty), revenue: round2(p.revenue) }))
      .filter((p) => p.qty !== 0)
      .sort(byPaper),
    revenue: round2(blocks.reduce((s, b) => s + b.revenue, 0)),
    capped,
  };
}
