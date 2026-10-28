export function formatMoney(value: number): string {
  return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

export function formatQty(value: number): string {
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/** "Pazartesi · 05.01.26 14:30" gibi gün adlı tarih-saat (not defteri kayıtları için). */
export function formatDayDateTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('tr-TR', { weekday: 'long' });
  return `${day.charAt(0).toLocaleUpperCase('tr-TR')}${day.slice(1)} · ${formatDateTime(iso)}`;
}

/** İki zaman arası süreyi "2 sa 15 dk" gibi verir; bitiş yoksa şimdiye kadar. */
export function formatDuration(startIso: string, endIso?: string | null): string {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const min = Math.max(0, Math.round((end - new Date(startIso).getTime()) / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
}

/**
 * Cihazın yerel saatine göre "2026-10-26" gün anahtarı. Nöbet günü,
 * vardiyanın başladığı yerel gündür; UTC kullanılırsa gece 00-03 arası
 * açılan nöbet bir önceki güne düşerdi.
 */
export function toDateKey(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Gün anahtarını yerel gece yarısı Date'ine çevirir. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "26.10.2026" */
export function formatDateKey(key: string): string {
  return fromDateKey(key).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** "26 Ekim 2026 Pazartesi" */
export function formatLongDateKey(key: string): string {
  return fromDateKey(key).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
  });
}

/** "+5" / "−3" gibi işaretli miktar. */
export function formatSigned(value: number): string {
  return `${value > 0 ? '+' : ''}${formatQty(value)}`;
}

/**
 * Hareketin stoka etkisi: raf değişimi ana metin, depo değişimi ayrı.
 * Depoya alımda raf değişmez; o zaman ana metin depo olur.
 */
export function movementEffect(m: { delta: number; depot_delta?: number | null }): {
  main: string;
  negative: boolean;
  depot: string | null;
} {
  const depot = Number(m.depot_delta ?? 0);
  if (m.delta === 0 && depot !== 0) {
    return { main: `depo ${formatSigned(depot)}`, negative: depot < 0, depot: null };
  }
  return {
    main: formatSigned(m.delta),
    negative: m.delta < 0,
    depot: depot !== 0 ? `depo ${formatSigned(depot)}` : null,
  };
}

/** "12,5" gibi Türkçe ondalık girdileri sayıya çevirir; geçersizse null. */
export function parseNumberInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
