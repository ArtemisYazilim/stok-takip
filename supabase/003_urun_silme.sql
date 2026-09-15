-- ============================================================
-- 003 — Ürün silme
-- Mevcut kuruluma (schema.sql çalıştırılmış) eklemek için bu
-- dosyanın tamamını Supabase SQL Editor'de çalıştırın.
-- Tüm ifadeler tekrar çalıştırılabilir (idempotent).
-- ============================================================

-- Admin ürünü siler: hareket geçmişi ve sayım kayıtlarıyla birlikte kalıcı kaldırılır.
-- İstemci urun.tsx ekranındaki "Ürünü Sil" butonundan çağırır.
create or replace function public.admin_delete_product(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  has_image boolean;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz işlem';
  end if;

  select image_url is not null into has_image
  from public.products where id = target_id;

  delete from public.stock_movements where product_id = target_id;
  delete from public.shift_counts where product_id = target_id;
  delete from public.products where id = target_id;

  -- Fotoğraf nesnesi ürün id'siyle saklanır; ürünle birlikte kaldır.
  if coalesce(has_image, false) then
    delete from storage.objects
    where bucket_id = 'product-images' and name = target_id::text;
  end if;
end;
$$;

grant execute on function public.admin_delete_product(uuid) to authenticated;
