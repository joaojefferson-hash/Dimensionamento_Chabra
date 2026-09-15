-- ============================================================================
-- Chabra Dimensiona — 0017_prazo_atendimento
-- Prazo (em dias) para atender uma empresa com documentos vencidos — régua da
-- tela "Fila de atendimento" (o que não é atendido num mês acumula no seguinte).
-- ============================================================================
alter table public.parametros add column prazo_dias integer not null default 60 check (prazo_dias between 1 and 365);
comment on column public.parametros.prazo_dias is 'Prazo para atender cada empresa com documentos vencidos (dias). Padrão 60.';
