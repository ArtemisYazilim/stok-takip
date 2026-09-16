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

/** "12,5" gibi Türkçe ondalık girdileri sayıya çevirir; geçersizse null. */
export function parseNumberInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
