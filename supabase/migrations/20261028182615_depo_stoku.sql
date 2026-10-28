-- ============================================================
-- Depo stoku
-- products.stock dışarıdaki raf stokudur (pompacının sattığı, kağıttaki
-- DVR/BAK). Depo ayrıca tutulur: satın alınan ürün depoya girer, pompacı
-- depodan rafa çıkarır (ÇKN = 'cikis': depo −, raf +).
--
-- Geriye uyum: 'alim' eskisi gibi rafa ekler; yayındaki eski uygulamanın
-- "Stoka Ekle" düğmesi bu geçişten sonra da aynı çalışır. Depoya alım
-- için yeni 'depo_alim' tipi eklenir (sadece admin).
-- Tüm ifadeler tekrar çalıştırılabilir (idempotent).
-- ============================================================

alter table public.products
  add column if not exists depot_stock numeric(10, 2) not null default 0;

-- Hareketin depoya etkisi; eski hareketlerin hepsi rafa işlendiği için 0.
alter table public.stock_movements
  add column if not exists depot_delta numeric(10, 2) not null default 0;

alter table public.stock_movements
  drop constraint if exists stock_movements_type_check;
alter table public.stock_movements
  add constraint stock_movements_type_check
  check (type in ('satis', 'alim', 'duzeltme', 'iade', 'cikis', 'depo_alim'));

-- Raf ve depo stokunu atomik günceller; ikisi de eksiye düşerse işlem
-- geri alınır. Depoda olmayan ürün rafa çıkarılamaz.
create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_stock numeric;
  new_depot numeric;
begin
  if new.type = 'satis' then
    new.delta := -new.qty;
    new.depot_delta := 0;
  elsif new.type in ('alim', 'iade') then
    new.delta := new.qty;
    new.depot_delta := 0;
  elsif new.type = 'depo_alim' then
    new.delta := 0;
    new.depot_delta := new.qty;
  elsif new.type = 'cikis' then
    new.delta := new.qty;
    new.depot_delta := -new.qty;
  end if;
  -- 'duzeltme' tipinde delta ve depot_delta istemciden geldiği gibi kullanılır.

  update public.products
  set stock = stock + new.delta,
      depot_stock = depot_stock + new.depot_delta
  where id = new.product_id
  returning stock, depot_stock into new_stock, new_depot;

  if new_stock is null then
    raise exception 'Ürün bulunamadı';
  end if;
  if new_stock < 0 then
    raise exception 'Yetersiz stok';
  end if;
  if new_depot < 0 then
    raise exception 'Depoda yeterli ürün yok';
  end if;

  return new;
end;
$$;

-- Excel aktarımı depo sütununu da işler: items[].depot doluysa depo
-- farkı ayrı bir 'duzeltme' hareketi (sadece depot_delta) olarak yazılır.
create or replace function public.admin_import_products(items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  pid uuid;
  current_stock numeric;
  current_depot numeric;
  target numeric;
  diff numeric;
  added int := 0;
  updated int := 0;
  moved int := 0;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz işlem';
  end if;

  for item in select * from jsonb_array_elements(items)
  loop
    pid := nullif(item ->> 'id', '')::uuid;

    if pid is null then
      if coalesce(trim(item ->> 'name'), '') = '' then
        raise exception 'Ürün adı boş olamaz';
      end if;
      insert into public.products (name, sale_price, sort_order)
      values (
        trim(item ->> 'name'),
        coalesce((item ->> 'sale_price')::numeric, 0),
        (item ->> 'sort_order')::int
      )
      returning id into pid;
      added := added + 1;
    else
      -- Excel'de olan ürün pasifse yeniden listeye alınır.
      update public.products
      set sale_price = coalesce((item ->> 'sale_price')::numeric, sale_price),
          sort_order = coalesce((item ->> 'sort_order')::int, sort_order),
          active = true
      where id = pid;
      if not found then
        raise exception 'Ürün bulunamadı: %', item ->> 'name';
      end if;
      updated := updated + 1;
    end if;

    select stock, depot_stock into current_stock, current_depot
    from public.products where id = pid for update;

    if item ->> 'stock' is not null then
      target := (item ->> 'stock')::numeric;
      if target < 0 then
        raise exception 'Stok eksi olamaz: %', item ->> 'name';
      end if;
      diff := target - current_stock;
      if diff <> 0 then
        insert into public.stock_movements (product_id, profile_id, type, qty, delta, note)
        values (pid, auth.uid(), 'duzeltme', abs(diff), diff, 'Excel aktarımı (raf)');
        moved := moved + 1;
      end if;
    end if;

    if item ->> 'depot' is not null then
      target := (item ->> 'depot')::numeric;
      if target < 0 then
        raise exception 'Depo stoku eksi olamaz: %', item ->> 'name';
      end if;
      diff := target - current_depot;
      if diff <> 0 then
        insert into public.stock_movements (product_id, profile_id, type, qty, delta, depot_delta, note)
        values (pid, auth.uid(), 'duzeltme', abs(diff), 0, diff, 'Excel aktarımı (depo)');
        moved := moved + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('eklenen', added, 'guncellenen', updated, 'stok_hareketi', moved);
end;
$$;

grant execute on function public.admin_import_products(jsonb) to authenticated;
