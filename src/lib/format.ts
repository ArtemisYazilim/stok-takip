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

/** "12,5" gibi Türkçe ondalık girdileri sayıya çevirir; geçersizse null. */
export function parseNumberInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
