import { colors } from '@/components/ui';

/**
 * Kağıttaki "POMPA SAYAÇLARI" tablosunun satırları, kağıttaki sırayla.
 * Kod, istasyon otomasyonundaki hortum kodudur; çizelgede sayaç okumaları
 * bu koda göre saklanır (shift_sheets.meters). Hortum eklenir/çıkarılırsa
 * sadece bu liste değişir, şema değişmez.
 */
export type FuelKind = 'motorin' | 'benzin' | 'ultra' | 'lpg' | 'adblue';

export interface Hose {
  kod: string;
  yakit: string;
  tur: FuelKind;
}

export const HOSES: Hose[] = [
  { kod: '100 101', yakit: 'MOTORİN', tur: 'motorin' },
  { kod: '100 102', yakit: 'BENZİN', tur: 'benzin' },
  { kod: '100 103', yakit: 'MOTORİN', tur: 'motorin' },
  { kod: '100 104', yakit: 'BENZİN', tur: 'benzin' },
  { kod: '100 105', yakit: 'U.MOTORİN', tur: 'ultra' },
  { kod: '100 106', yakit: 'MOTORİN', tur: 'motorin' },
  { kod: '100 107', yakit: 'U.MOTORİN', tur: 'ultra' },
  { kod: '100 108', yakit: 'MOTORİN', tur: 'motorin' },
  { kod: '100 115', yakit: 'U.MOTORİN', tur: 'ultra' },
  { kod: '100 116', yakit: 'MOTORİN', tur: 'motorin' },
  { kod: '100 109', yakit: 'MOTORİN', tur: 'motorin' },
  { kod: '100 110', yakit: 'U.MOTORİN', tur: 'ultra' },
  { kod: '100 111', yakit: 'MOTORİN', tur: 'motorin' },
  { kod: '100 112', yakit: 'U.MOTORİN', tur: 'ultra' },
  { kod: '100 113', yakit: 'LPG 1', tur: 'lpg' },
  { kod: '100 114', yakit: 'LPG 2', tur: 'lpg' },
  { kod: '100 66', yakit: 'ADBLUE', tur: 'adblue' },
];

/** Yakıt türünü satırda ayırt etmek için yazı rengi. */
export const FUEL_COLORS: Record<FuelKind, string> = {
  motorin: colors.text,
  benzin: colors.success,
  ultra: colors.primary,
  lpg: colors.warning,
  adblue: colors.primaryDark,
};

/** Sayaç tablosunun solundaki tek değerli alanlar, kağıttaki sırayla. */
export const SUMMARY_FIELDS = [
  { key: 'otomasyon_tl', label: 'OTOMASYON TL' },
  { key: 'otomasyon_lt', label: 'OTOMASYON LT' },
  { key: 'gun_sonu_1', label: 'GÜN SONU 1' },
  { key: 'gun_sonu_2', label: 'GÜN SONU 2' },
  { key: 'gun_sonu_3', label: 'GÜN SONU 3' },
] as const;

export type SummaryKey = (typeof SUMMARY_FIELDS)[number]['key'];

/** Kağıdın altındaki PMP1..PMP5 sütunları ve her sütundaki satır sayısı. */
export const PMP_COUNT = 5;
export const PMP_ROWS = 3;

/** shift_sheet_changes.field yolunun kağıttaki adı ("MOTORİN 100 101 M.SAYAÇ"). */
export function sheetFieldLabel(path: string): string {
  const [root, a, b, c] = path.split('.');
  if (root === 'meters') {
    const hose = HOSES.find((h) => h.kod === a);
    return `${hose?.yakit ?? 'Hortum'} ${a} ${b === 'e' ? 'E.SAYAÇ' : 'M.SAYAÇ'}`;
  }
  if (root === 'extras') {
    if (a === 'pmp') return `PMP${Number(b) + 1} · ${Number(c) + 1}. satır`;
    if (a === 'serbest') return `${Number(b) + 1}. satır ${c === 'tutar' ? 'tutarı' : 'açıklaması'}`;
    const field = SUMMARY_FIELDS.find((f) => f.key === a);
    if (field) return field.label;
  }
  return path;
}

/** Çizelge başlığında kağıttaki gibi görünen istasyon adı. */
export const STATION_NAME = 'GÜLCE';
