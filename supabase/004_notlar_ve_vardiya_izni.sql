-- ============================================================
-- 004 — Çalışan notları + vardiya açma izni + satışta iade
-- Mevcut kuruluma (schema.sql + 002 + 003 çalıştırılmış) eklemek
-- için bu dosyanın tamamını Supabase SQL Editor'de çalıştırın.
-- Tüm ifadeler tekrar çalıştırılabilir (idempotent).
-- ============================================================

-- ---- Satışta iade -------------------------------------------
-- İade artık sadece admin değil; çalışan da kendi adına iade yazabilir.
drop policy if exists "movements_insert" on public.stock_movements;
create policy "movements_insert" on public.stock_movements
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and (type in ('satis', 'iade') or public.is_admin())
  );
