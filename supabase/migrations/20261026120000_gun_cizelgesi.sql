-- ============================================================
-- 005 — Nöbet çizelgesi (kağıttaki "2. sayfa": pompa sayaçları)
-- Supabase CLI geçişi: `npm run db:push` (ya da master'a push'ta CI) uygular.
-- Tüm ifadeler tekrar çalıştırılabilir (idempotent).
--
-- Mevcut tablolara dokunmaz; yalnızca yeni tablo ekler. Bu yüzden
-- yayındaki eski uygulama sürümü bu dosyadan etkilenmez.
-- ============================================================

-- Her vardiyanın (nöbetin) çizelgesi. 1. sayfa (yağ satışı) zaten
-- stock_movements'tan hesaplanır; burada sadece 2. sayfanın elle girilen
-- alanları tutulur. Kağıttaki düzen henüz netleşmediği için alanlar
-- jsonb: hortum listesi veya ek alanlar değişince şema değişmesin.
--   meters: { "100101": { "m": 1234.5, "e": 1240.1 }, ... }
--   extras: { "otomasyon_tl": ..., "gun_sonu_1": ..., "pmp": [[...]], "serbest": [...] }
create table if not exists public.shift_sheets (
  shift_id uuid primary key references public.shifts (id) on delete cascade,
  meters jsonb not null default '{}'::jsonb,
  extras jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shift_sheets enable row level security;

-- Herkes okur: bir sonraki nöbetçi, sayaç farkını görmek için önceki
-- nöbetin okumasına ihtiyaç duyar.
drop policy if exists "shift_sheets_select" on public.shift_sheets;
create policy "shift_sheets_select" on public.shift_sheets
  for select to authenticated
  using (true);

-- Yazma: vardiyanın sahibi veya admin.
drop policy if exists "shift_sheets_insert" on public.shift_sheets;
create policy "shift_sheets_insert" on public.shift_sheets
  for insert to authenticated
  with check (
    exists (
      select 1 from public.shifts s
      where s.id = shift_id and (s.profile_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "shift_sheets_update" on public.shift_sheets;
create policy "shift_sheets_update" on public.shift_sheets
  for update to authenticated
  using (
    exists (
      select 1 from public.shifts s
      where s.id = shift_id and (s.profile_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.shifts s
      where s.id = shift_id and (s.profile_id = auth.uid() or public.is_admin())
    )
  );
