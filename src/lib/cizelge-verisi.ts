import { supabase } from '@/lib/supabase';
import type { MeterReading, ShiftSheet, ShiftSheetChange, ShiftSheetExtras } from '@/lib/types';

/** PostgREST "tablo yok" hataları: ilgili geçiş henüz uygulanmamış demektir. */
export function isMissingTable(code?: string) {
  return code === 'PGRST205' || code === '42P01';
}

/** Nöbetin 2. sayfası; missing = gun_cizelgesi geçişi uygulanmamış. */
export async function loadSheet(shiftId: string): Promise<{ sheet: ShiftSheet | null; missing: boolean }> {
  const { data, error } = await supabase.from('shift_sheets').select('*').eq('shift_id', shiftId).maybeSingle();
  if (error && isMissingTable(error.code)) return { sheet: null, missing: true };
  return { sheet: (data as ShiftSheet) ?? null, missing: false };
}

/**
 * Sayaçlar istasyonundur, kişiye ait değil: önceki okuma, kim girerse
 * girsin bir önceki nöbetlerden hortum bazında en yeni dolu değerdir.
 */
export async function loadPrevMeters(startedAt: string): Promise<Record<string, MeterReading>> {
  const { data: prev } = await supabase
    .from('shifts')
    .select('id')
    .lt('started_at', startedAt)
    .order('started_at', { ascending: false })
    .limit(10);
  const prevIds = ((prev as { id: string }[]) ?? []).map((r) => r.id);
  const merged: Record<string, MeterReading> = {};
  if (prevIds.length === 0) return merged;
  const { data: sheets } = await supabase.from('shift_sheets').select('shift_id, meters').in('shift_id', prevIds);
  const byShift = new Map(
    ((sheets as Pick<ShiftSheet, 'shift_id' | 'meters'>[]) ?? []).map((s) => [s.shift_id, s.meters]),
  );
  for (const sid of prevIds) {
    for (const [kod, r] of Object.entries(byShift.get(sid) ?? {})) {
      const cur = merged[kod] ?? { m: null, e: null };
      merged[kod] = { m: cur.m ?? r.m ?? null, e: cur.e ?? r.e ?? null };
    }
  }
  return merged;
}

export async function saveSheet(
  shiftId: string,
  userId: string,
  meters: Record<string, MeterReading>,
  extras: ShiftSheetExtras,
): Promise<{ sheet: ShiftSheet | null; error: string | null }> {
  const { data, error } = await supabase
    .from('shift_sheets')
    .upsert({
      shift_id: shiftId,
      meters,
      extras,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) return { sheet: null, error: error.message };
  return { sheet: data as ShiftSheet, error: null };
}

/** 2. sayfanın değişiklik geçmişi (sadece admin okuyabilir), en yeni başta. */
export async function loadSheetChanges(
  shiftId: string,
): Promise<{ changes: ShiftSheetChange[]; missing: boolean }> {
  const { data, error } = await supabase
    .from('shift_sheet_changes')
    .select('*, profiles(full_name)')
    .eq('shift_id', shiftId)
    .order('created_at', { ascending: false })
    .order('id');
  if (error && isMissingTable(error.code)) return { changes: [], missing: true };
  return { changes: (data as ShiftSheetChange[]) ?? [], missing: false };
}

export interface ChangeGroup {
  key: string;
  who: string;
  at: string;
  changes: ShiftSheetChange[];
}

/** Aynı kayıttaki hücreler tek transaction'da yazılır, aynı created_at'i taşır. */
export function groupChanges(changes: ShiftSheetChange[]): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  for (const c of changes) {
    const key = `${c.created_at}|${c.changed_by ?? ''}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.changes.push(c);
    else groups.push({ key, who: c.profiles?.full_name || 'Bilinmeyen', at: c.created_at, changes: [c] });
  }
  return groups;
}
