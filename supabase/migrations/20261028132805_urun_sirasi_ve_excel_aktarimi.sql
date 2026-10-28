-- ============================================================
-- Ürün sırası + Excel'den ürün aktarımı
-- Çizelge, kağıttaki yağ listesiyle aynı sırada görünsün diye ürünlere
-- sıra numarası eklenir (Excel'deki satır sırası). Sırası olmayan ürün
-- listenin sonunda ada göre dizilir.
-- Tüm ifadeler tekrar çalıştırılabilir (idempotent).
-- ============================================================

alter table public.products
  add column if not exists sort_order integer;

-- Admin, Excel'den yapıştırdığı ürün listesini tek işlemde aktarır.
-- Satırlar istemcide mevcut ürünlerle eşleştirilir (id varsa günceller,
-- yoksa ekler). Stok asla doğrudan yazılmaz: hedef stokla mevcut stok
-- arasındaki fark 'duzeltme' hareketi olarak eklenir, tetikleyici işler.
-- Tek fonksiyon = tek transaction: bir satır hatalıysa hiçbiri yazılmaz.
--   items: [{ "id": uuid|null, "name": text, "sale_price": num|null,
--             "sort_order": int|null, "stock": num|null }]
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

    if item ->> 'stock' is not null then
      target := (item ->> 'stock')::numeric;
      if target < 0 then
        raise exception 'Stok eksi olamaz: %', item ->> 'name';
      end if;
      select stock into current_stock from public.products where id = pid for update;
      diff := target - current_stock;
      if diff <> 0 then
        insert into public.stock_movements (product_id, profile_id, type, qty, delta, note)
        values (pid, auth.uid(), 'duzeltme', abs(diff), diff, 'Excel aktarımı');
        moved := moved + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('eklenen', added, 'guncellenen', updated, 'stok_hareketi', moved);
end;
$$;

grant execute on function public.admin_import_products(jsonb) to authenticated;
