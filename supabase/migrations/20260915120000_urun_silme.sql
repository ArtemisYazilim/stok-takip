-- ============================================================
-- 003 — Ürün silme
-- Tüm ifadeler tekrar çalıştırılabilir (idempotent). Canlı veritabanına
-- CLI'dan önce SQL Editor'de elle uygulandığı için orada yeniden
-- çalıştırılmaz; `supabase migration repair --status applied` ile
-- geçmişe işlendi. Taze kurulumda `npm run db:push` sırayla uygular.
-- ============================================================

-- Admin ürünü siler: hareket geçmişi ve sayım kayıtlarıyla birlikte kalıcı kaldırılır.
-- İstemci urun.tsx ekranındaki "Ürünü Sil" butonundan çağırır.
create or replace function public.admin_delete_product(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz işlem';
  end if;

  delete from public.stock_movements where product_id = target_id;
  delete from public.shift_counts where product_id = target_id;
  delete from public.products where id = target_id;

  -- Not: Fotoğraf silme burada yapılamaz; Supabase storage tablolarından
  -- SQL ile doğrudan silmeyi engeller. İstemci Storage API ile kaldırır.
end;
$$;

grant execute on function public.admin_delete_product(uuid) to authenticated;
