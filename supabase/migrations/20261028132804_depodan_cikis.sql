-- ============================================================
-- Depodan çıkış (kağıttaki ÇKN sütunu)
-- Pompacı gün içinde depodan dışarıdaki rafa ürün çıkarır; bu ürünler
-- satılabilir stoğa (products.stock = dışarıdaki raf) eklenir.
-- Kağıtta: DVR = önceki BAK + ÇKN, BAK = DVR − satış.
-- Alımdan (admin, satın alma) ayrı tip tutulur ki raporlarda karışmasın.
-- Tüm ifadeler tekrar çalıştırılabilir (idempotent).
-- ============================================================

alter table public.stock_movements
  drop constraint if exists stock_movements_type_check;
alter table public.stock_movements
  add constraint stock_movements_type_check
  check (type in ('satis', 'alim', 'duzeltme', 'iade', 'cikis'));

-- Stok tetikleyicisi: cikis da alım gibi stoğu artırır.
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
  elsif new.type in ('alim', 'iade', 'cikis') then
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

-- Çalışan satış, iade ve depodan çıkışı kendi adına yazar; alım ve
-- düzeltme sadece admin. cikis delta'sı tetikleyicide hep +qty olduğu
-- için çalışan bununla stok düşüremez (eksik ürünü gizleyemez); yanlış
-- girilen ÇKN'yi admin düzeltme ile geri alır.
drop policy if exists "movements_insert" on public.stock_movements;
create policy "movements_insert" on public.stock_movements
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and (type in ('satis', 'iade', 'cikis') or public.is_admin())
  );
