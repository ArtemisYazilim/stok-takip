-- ============================================================
-- Pompa sayaçları (2. sayfa) değişiklik geçmişi
-- Admin, nöbet çizelgesinin 2. sayfasında kimin hangi hücreyi neyden
-- neye değiştirdiğini görür. Kayıtları yalnızca tetikleyici yazar;
-- istemci yazamaz, değiştiremez (notifications ile aynı desen).
-- Tüm ifadeler tekrar çalıştırılabilir (idempotent).
-- ============================================================

create table if not exists public.shift_sheet_changes (
  id bigint generated always as identity primary key,
  shift_id uuid not null references public.shifts (id) on delete cascade,
  changed_by uuid references public.profiles (id) on delete set null,
  -- Hücre yolu: 'meters.100 101.m', 'extras.otomasyon_tl', 'extras.pmp.0.2',
  -- 'extras.serbest.0.aciklama'. Etiketi istemci çıkarır (src/lib/pompa.ts).
  field text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists shift_sheet_changes_shift_idx
  on public.shift_sheet_changes (shift_id, created_at desc);

alter table public.shift_sheet_changes enable row level security;

drop policy if exists "shift_sheet_changes_select_admin" on public.shift_sheet_changes;
create policy "shift_sheet_changes_select_admin" on public.shift_sheet_changes
  for select to authenticated
  using (public.is_admin());
-- INSERT/UPDATE/DELETE politikası bilinçli olarak yok: geçmiş değiştirilemez.

-- jsonb belgeyi yaprak hücrelere açar: (yol, değer). null yapraklar
-- atlanır; böylece "hiç girilmemiş" ile "boş bırakılmış" aynı sayılır ve
-- ilk kayıtta boş hücreler değişiklik gibi görünmez.
create or replace function public.jsonb_leaves(doc jsonb)
returns table (path text, value jsonb)
language sql
immutable
as $$
  with recursive walk(path, value) as (
    select ''::text, doc
    union all
    select
      case when w.path = '' then e.key else w.path || '.' || e.key end,
      e.value
    from walk w,
    lateral (
      select key, value
      from jsonb_each(case when jsonb_typeof(w.value) = 'object' then w.value end)
      union all
      select (a.ord - 1)::text, a.value
      from jsonb_array_elements(case when jsonb_typeof(w.value) = 'array' then w.value end)
        with ordinality as a(value, ord)
    ) e
  )
  select path, value from walk
  where jsonb_typeof(value) not in ('object', 'array', 'null');
$$;

-- Her kayıtta eski ve yeni çizelge hücre hücre karşılaştırılır; aynı
-- kayıttaki değişiklikler aynı created_at'i taşır (tek transaction).
-- Kişi auth.uid()'den alınır: istemcinin yazdığı updated_by'a güvenilmez.
create or replace function public.log_shift_sheet_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_doc jsonb := '{}'::jsonb;
  new_doc jsonb := jsonb_build_object('meters', new.meters, 'extras', new.extras);
begin
  if tg_op = 'UPDATE' then
    old_doc := jsonb_build_object('meters', old.meters, 'extras', old.extras);
  end if;

  insert into public.shift_sheet_changes (shift_id, changed_by, field, old_value, new_value)
  select new.shift_id, coalesce(auth.uid(), new.updated_by), coalesce(o.path, n.path), o.value, n.value
  from public.jsonb_leaves(old_doc) o
  full outer join public.jsonb_leaves(new_doc) n on o.path = n.path
  where o.value is distinct from n.value;

  return new;
end;
$$;

drop trigger if exists shift_sheets_log_change on public.shift_sheets;
create trigger shift_sheets_log_change
  after insert or update on public.shift_sheets
  for each row execute function public.log_shift_sheet_change();
