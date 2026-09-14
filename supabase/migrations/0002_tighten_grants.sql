-- ============================================================================
-- Chabra Dimensiona — 0002_tighten_grants
-- Remove privilégios que vieram dos default privileges do Supabase e não fazem
-- parte do modelo: TRUNCATE ignora RLS; REFERENCES/TRIGGER são DDL.
-- ============================================================================
revoke truncate, references, trigger
  on table public.unidades, public.documentos, public.colaboradores
  from authenticated;
