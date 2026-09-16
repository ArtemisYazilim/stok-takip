-- ============================================================
-- 004 — Çalışan notları + vardiya açma izni + satışta iade
-- Mevcut kuruluma (schema.sql + 002 + 003 çalıştırılmış) eklemek
-- için bu dosyanın tamamını Supabase SQL Editor'de çalıştırın.
-- Tüm ifadeler tekrar çalıştırılabilir (idempotent).
-- ============================================================

-- ---- Vardiya açma izni --------------------------------------
-- false ise çalışan kendi vardiyasını açamaz; admin onun için açar.
alter table public.profiles
  add column if not exists can_open_shift boolean not null default true;

-- Admin, çalışanı açarken izni metadata ile gönderebilsin diye
-- yeni kullanıcı tetikleyicisi can_open_shift'i de okur.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, can_open_shift)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'calisan'),
    coalesce((new.raw_user_meta_data ->> 'can_open_shift')::boolean, true)
  );
  return new;
end;
$$;

-- Vardiya açma: admin herkes için açar; çalışan ancak izni varsa kendine açar.
drop policy if exists "shifts_insert_own" on public.shifts;
drop policy if exists "shifts_insert" on public.shifts;
create policy "shifts_insert" on public.shifts
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      profile_id = auth.uid()
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.can_open_shift
      )
    )
  );

-- ---- Satışta iade -------------------------------------------
-- İade artık sadece admin değil; çalışan da kendi adına iade yazabilir.
drop policy if exists "movements_insert" on public.stock_movements;
create policy "movements_insert" on public.stock_movements
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and (type in ('satis', 'iade') or public.is_admin())
  );
