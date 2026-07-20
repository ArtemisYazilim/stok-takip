-- ============================================================
-- 002 — Ürün fotoğrafı + admin bildirimleri
-- Mevcut kuruluma (schema.sql çalıştırılmış) eklemek için bu
-- dosyanın tamamını Supabase SQL Editor'de çalıştırın.
-- Tüm ifadeler tekrar çalıştırılabilir (idempotent).
-- ============================================================

-- ---- Ürün fotoğrafı -----------------------------------------
alter table public.products
  add column if not exists image_url text;

-- Fotoğraflar için herkese açık okunur depolama kovası.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product_images_read" on storage.objects;
create policy "product_images_read" on storage.objects
  for select
  using (bucket_id = 'product-images');

drop policy if exists "product_images_admin_insert" on storage.objects;
create policy "product_images_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product_images_admin_update" on storage.objects;
create policy "product_images_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product_images_admin_delete" on storage.objects;
create policy "product_images_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- ---- Admin bildirimleri -------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  body text not null,
  shift_id uuid references public.shifts (id) on delete set null,
  has_diff boolean not null default false,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_created
  on public.notifications (created_at desc);

alter table public.notifications enable row level security;

-- Bildirimleri sadece adminler görür ve okundu işaretler.
drop policy if exists "notifications_select_admin" on public.notifications;
create policy "notifications_select_admin" on public.notifications
  for select to authenticated
  using (public.is_admin());

drop policy if exists "notifications_update_admin" on public.notifications;
create policy "notifications_update_admin" on public.notifications
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
-- Not: INSERT için politika yok; kayıtları yalnızca aşağıdaki
-- security definer tetikleyici açar (RLS'i baypas eder).

-- Vardiya kapanınca (ended_at null -> dolu) admin bildirimi üret.
create or replace function public.notify_shift_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  worker_name text;
  diff_count int;
  total_count int;
  diff_detail text;
  body_text text;
begin
  if new.ended_at is null or old.ended_at is not null then
    return new;
  end if;

  select coalesce(nullif(full_name, ''), 'Çalışan')
    into worker_name
  from public.profiles
  where id = new.profile_id;

  select
    count(*) filter (where counted_qty <> expected_qty),
    count(*)
    into diff_count, total_count
  from public.shift_counts
  where shift_id = new.id;

  select string_agg(
           p.name || ' '
           || case when (sc.counted_qty - sc.expected_qty) > 0 then '+' else '' end
           || trim(to_char(sc.counted_qty - sc.expected_qty, 'FM999999990.##')),
           ', '
         )
    into diff_detail
  from public.shift_counts sc
  join public.products p on p.id = sc.product_id
  where sc.shift_id = new.id and sc.counted_qty <> sc.expected_qty;

  if coalesce(diff_count, 0) = 0 then
    body_text := coalesce(worker_name, 'Çalışan')
      || ' vardiyayı kapattı. Sayım tuttu ('
      || coalesce(total_count, 0) || ' ürün).';
  else
    body_text := coalesce(worker_name, 'Çalışan')
      || ' vardiyayı kapattı. ' || diff_count
      || ' üründe fark: ' || coalesce(diff_detail, '');
  end if;

  insert into public.notifications (type, title, body, shift_id, has_diff)
  values (
    case when coalesce(diff_count, 0) = 0 then 'shift_ok' else 'shift_diff' end,
    'Vardiya kapatıldı',
    body_text,
    new.id,
    coalesce(diff_count, 0) > 0
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_shift_closed on public.shifts;
create trigger trg_notify_shift_closed
  after update on public.shifts
  for each row execute function public.notify_shift_closed();

-- Canlı (realtime) bildirim için tabloyu yayına ekle.
do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
