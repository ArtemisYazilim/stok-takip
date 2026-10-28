/**
 * Excel'den ürün aktarımı: admin, Excel'deki yağ listesini (başlık satırıyla)
 * kopyalayıp yapıştırır. Excel kopyalanan hücreleri sekmeyle ayrılmış metin
 * olarak verir; dosya seçici veya xlsx kütüphanesi gerekmez, web'de de çalışır.
 */

export type ImportField = 'name' | 'price' | 'ckn' | 'dvr' | 'gn1' | 'gn2' | 'bak' | 'stok';

export const FIELD_LABELS: Record<ImportField, string> = {
  name: 'YAĞ ADI',
  price: 'FİYAT',
  ckn: 'ÇKN',
  dvr: 'DVR',
  gn1: '1 GN',
  gn2: '2.GN',
  bak: 'BAK.',
  stok: 'STOK',
};

// Başlık hücresi normalize edilince (Türkçe harf katlanır, harf/rakam dışı
// atılır) bu adlardan biriyse o alan sayılır. "ADET" bilinçli olarak yok:
// kağıdın sağındaki satış dökümünün sütunudur, stok değildir.
const HEADER_ALIASES: Record<ImportField, string[]> = {
  name: ['YAGADI', 'URUNADI', 'URUN', 'MALZEME', 'MALZEMEADI', 'ADI', 'AD'],
  price: ['FIYAT', 'FIYATI', 'SATISFIYATI'],
  ckn: ['CKN', 'CIKAN'],
  dvr: ['DVR', 'DEVIR'],
  gn1: ['1GN', '1GUN'],
  gn2: ['2GN', '2GUN'],
  bak: ['BAK', 'BAKIYE', 'KALAN'],
  stok: ['STOK', 'MEVCUT'],
};

const TURKISH_FOLD: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u',
  Ç: 'c', Ğ: 'g', İ: 'i', I: 'i', Ö: 'o', Ş: 's', Ü: 'u',
};

/**
 * Eşleştirme anahtarı: "4X4 YAG BUYUK" ile "4x4 Yağ Büyük" aynı ürün sayılır.
 * Türkçe harfler katlanır, boşluk ve noktalama atılır.
 */
export function normalizeKey(text: string): string {
  return text
    .split('')
    .map((ch) => TURKISH_FOLD[ch] ?? ch)
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Excel hücresindeki sayı. Türkçe Excel binlik ayırıcı olarak nokta,
 * ondalık için virgül kullanır ("2.500" = 2500, "12,5" = 12,5).
 * Boş hücre null, sayı olmayan hücre undefined döner.
 */
export function parseExcelNumber(text: string | undefined): number | null | undefined {
  const t = (text ?? '').replace(/\s/g, '').replace(/₺|TL/gi, '');
  if (t === '') return null;
  let n: string;
  if (t.includes(',') && t.includes('.')) {
    n = t.lastIndexOf(',') > t.lastIndexOf('.')
      ? t.replace(/\./g, '').replace(',', '.')
      : t.replace(/,/g, '');
  } else if (t.includes(',')) {
    n = t.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    n = t.replace(/\./g, '');
  } else {
    n = t;
  }
  const v = Number(n);
  return Number.isFinite(v) ? v : undefined;
}

/** 0 → "A", 26 → "AA" (kullanıcıya Excel sütun harfiyle gösterilir). */
export function columnLetter(index: number): string {
  let s = '';
  let i = index + 1;
  while (i > 0) {
    const r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

export interface ParsedRow {
  /** Excel'deki satır sırası (1'den), ürün sırası olarak kullanılır. */
  order: number;
  name: string;
  values: Partial<Record<Exclude<ImportField, 'name'>, number | null | undefined>>;
}

export interface ParsedTable {
  /** Alan → Excel sütun indeksi. */
  columns: Partial<Record<ImportField, number>>;
  headerFound: boolean;
  rows: ParsedRow[];
}

export function parseExcelTable(text: string): ParsedTable {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  // Excel sekmeyle ayırır; Türkçe CSV ise noktalı virgül kullanır.
  const sep = text.includes('\t') ? '\t' : ';';
  const grid = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1')));

  // Başlık satırı: ilk 15 satır içinde ürün adı başlığı taşıyan ilk satır.
  // Her alan için o satırdaki ilk eşleşen sütun alınır; kağıdın sağındaki
  // ikinci "YAĞ ADI / FİYAT" grubu böylece atlanır.
  let headerIndex = -1;
  const columns: Partial<Record<ImportField, number>> = {};
  for (let r = 0; r < Math.min(grid.length, 15) && headerIndex < 0; r++) {
    const keys = grid[r].map(normalizeKey);
    if (!keys.some((k) => HEADER_ALIASES.name.includes(k))) continue;
    headerIndex = r;
    (Object.keys(HEADER_ALIASES) as ImportField[]).forEach((field) => {
      const idx = keys.findIndex((k) => HEADER_ALIASES[field].includes(k));
      if (idx >= 0) columns[field] = idx;
    });
  }

  // Başlık yoksa düz liste varsayılır: A = ad, B = fiyat, C = stok.
  if (headerIndex < 0) {
    columns.name = 0;
    columns.price = 1;
    columns.stok = 2;
  }

  const rows: ParsedRow[] = [];
  for (let r = headerIndex + 1; r < grid.length; r++) {
    const cells = grid[r];
    const name = (cells[columns.name ?? 0] ?? '').replace(/\s+/g, ' ').trim();
    if (name === '') continue;
    const key = normalizeKey(name);
    if (key === 'TOPLAM' || key === 'GENELTOPLAM') continue;
    const values: ParsedRow['values'] = {};
    (Object.keys(columns) as ImportField[]).forEach((field) => {
      if (field === 'name') return;
      values[field] = parseExcelNumber(cells[columns[field]!]);
    });
    rows.push({ order: rows.length + 1, name, values });
  }

  return { columns, headerFound: headerIndex >= 0, rows };
}

/** Stok hangi sütundan alınacak. */
export type StockSource = 'bak' | 'hesap' | 'dvr' | 'stok' | 'yok';

export const STOCK_SOURCE_LABELS: Record<StockSource, string> = {
  bak: 'BAK.',
  hesap: 'DVR − 1 GN − 2.GN',
  dvr: 'DVR',
  stok: 'STOK',
  yok: 'Stoka dokunma',
};

/** Tablodaki sütunlara göre seçilebilir stok kaynakları. */
export function availableStockSources(table: ParsedTable): StockSource[] {
  const c = table.columns;
  const out: StockSource[] = [];
  if (c.bak !== undefined) out.push('bak');
  if (c.dvr !== undefined && (c.gn1 !== undefined || c.gn2 !== undefined)) out.push('hesap');
  if (c.dvr !== undefined) out.push('dvr');
  if (c.stok !== undefined) out.push('stok');
  out.push('yok');
  return out;
}

/**
 * Varsayılan kaynak: BAK. doluysa o (dönem kapanmış), değilse kağıdın
 * kuralıyla DVR − satışlar (dönem ortası), o da yoksa DVR / STOK.
 */
export function defaultStockSource(table: ParsedTable): StockSource {
  const sources = availableStockSources(table);
  const bakFilled = table.rows.some((r) => typeof r.values.bak === 'number');
  if (sources.includes('bak') && bakFilled) return 'bak';
  return sources.find((s) => s !== 'bak') ?? 'yok';
}

/**
 * Satırın seçilen kaynaktaki stoku. Kağıtta boş hücre 0 demektir (ör. DVR'si
 * boş ürün rafta yok). undefined = hücre sayı değil (hatalı satır).
 */
export function stockFor(row: ParsedRow, source: StockSource): number | null | undefined {
  if (source === 'yok') return null;
  const v = row.values;
  // Tabloda hiç olmayan sütun boş sayılır; var olup sayı olmayan hücre hatadır.
  const cell = (f: Exclude<ImportField, 'name'>) => (f in v ? v[f] : null);
  if (source === 'hesap') {
    const dvr = cell('dvr');
    const gn1 = cell('gn1');
    const gn2 = cell('gn2');
    if (dvr === undefined || gn1 === undefined || gn2 === undefined) return undefined;
    return (dvr ?? 0) - (gn1 ?? 0) - (gn2 ?? 0);
  }
  const value = cell(source);
  if (value === undefined) return undefined;
  return value ?? 0;
}
