-- ============================================================================
-- Chabra Dimensiona — 0004_tighten_grants_parametros
-- Default privileges deram ALL a authenticated em parametros; manter só
-- select/update (linha única, nunca inserida/apagada pelo app).
-- ============================================================================
revoke insert, delete, truncate, references, trigger
  on table public.parametros
  from authenticated;
