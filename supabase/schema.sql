-- Stok Takip veritabanı şeması
-- Supabase SQL Editor'de bu dosyanın tamamını çalıştırın.

-- ============================================================
-- Tablolar
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'calisan' check (role in ('admin', 'calisan')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default 'adet',
  sale_price numeric(10, 2) not null default 0,
  stock numeric(10, 2) not null default 0,
  min_stock numeric(10, 2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

-- Bir çalışanın aynı anda tek açık vardiyası olabilir.
create unique index one_open_shift_per_user
  on public.shifts (profile_id)
  where ended_at is null;

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  profile_id uuid not null references public.profiles (id),
  shift_id uuid references public.shifts (id),
  type text not null check (type in ('satis', 'alim', 'duzeltme', 'iade')),
  qty numeric(10, 2) not null check (qty > 0),
  delta numeric(10, 2) not null default 0,
  unit_price numeric(10, 2),
  note text,
  created_at timestamptz not null default now()
);

create index idx_movements_created on public.stock_movements (created_at desc);
create index idx_movements_shift on public.stock_movements (shift_id);

create table public.shift_counts (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  product_id uuid not null references public.products (id),
  expected_qty numeric(10, 2) not null,
  counted_qty numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  unique (shift_id, product_id)
);

-- ============================================================
-- Fonksiyonlar ve tetikleyiciler
-- ============================================================

-- Admin kontrolü (RLS politikalarında kullanılır; security definer
-- sayesinde profiles üzerindeki RLS'e takılmaz).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

-- Yeni auth kullanıcısı oluşunca profil satırı aç.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'calisan')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin çalışanı siler: kendi vardiya/satış geçmişiyle birlikte kalıcı olarak kaldırılır.
create or replace function public.admin_delete_employee(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz işlem';
  end if;
  if target_id = auth.uid() then
    raise exception 'Kendi hesabınızı silemezsiniz';
  end if;

  delete from public.stock_movements
  where profile_id = target_id
     or shift_id in (select id from public.shifts where profile_id = target_id);

  delete from public.shifts where profile_id = target_id;

  delete from auth.users where id = target_id;
end;
$$;

grant execute on function public.admin_delete_employee(uuid) to authenticated;

-- Stok hareketi eklenince ürün stokunu atomik güncelle.
-- Satışta stok eksiye düşerse hata fırlatır, işlem geri alınır.
create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_stock numeric;
begin
  if new.type = 'satis' then
    new.delta := -new.qty;
  elsif new.type in ('alim', 'iade') then
    new.delta := new.qty;
  end if;
  -- 'duzeltme' tipinde delta istemciden geldiği gibi kullanılır.

  update public.products
  set stock = stock + new.delta
  where id = new.product_id
  returning stock into new_stock;

  if new_stock is null then
    raise exception 'Ürün bulunamadı';
  end if;
  if new_stock < 0 then
    raise exception 'Yetersiz stok';
  end if;

  return new;
end;
$$;

create trigger trg_apply_stock_movement
  before insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- ============================================================
-- Satır düzeyi güvenlik (RLS)
-- ============================================================

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.shifts enable row level security;
alter table public.stock_movements enable row level security;
alter table public.shift_counts enable row level security;

-- profiles: herkes kendi profilini görür, admin hepsini görür/günceller.
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- products: giriş yapan herkes okur, sadece admin ekler/değiştirir.
create policy "products_select" on public.products
  for select to authenticated
  using (true);

create policy "products_insert_admin" on public.products
  for insert to authenticated
  with check (public.is_admin());

create policy "products_update_admin" on public.products
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- shifts: herkes okur; çalışan kendi vardiyasını açar/kapatır, admin hepsini.
create policy "shifts_select" on public.shifts
  for select to authenticated
  using (true);

create policy "shifts_insert_own" on public.shifts
  for insert to authenticated
  with check (profile_id = auth.uid());

create policy "shifts_update" on public.shifts
  for update to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- stock_movements: herkes okur; satışı herkes kendi adına yazar,
-- alım/düzeltme/iade sadece admin.
create policy "movements_select" on public.stock_movements
  for select to authenticated
  using (true);

create policy "movements_insert" on public.stock_movements
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and (type = 'satis' or public.is_admin())
  );

-- shift_counts: herkes okur; sayımı vardiya sahibi veya admin yazar.
create policy "shift_counts_select" on public.shift_counts
  for select to authenticated
  using (true);

create policy "shift_counts_insert" on public.shift_counts
  for insert to authenticated
  with check (
    exists (
      select 1 from public.shifts s
      where s.id = shift_id and (s.profile_id = auth.uid() or public.is_admin())
    )
  );
