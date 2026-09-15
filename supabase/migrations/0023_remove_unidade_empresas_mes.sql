-- 0023 — Depois do front na versão com demanda_mensal/unidade_mes (commit ff2fe1f):
-- remove a tabela antiga unidade_empresas_mes e as colunas "padrão" de unidades.
-- Os dados já foram copiados na 0022 (porte P). O histórico antigo continua legível
-- (as linhas de unidade_empresas_mes ficam em historico com o nome da tabela).

drop table public.unidade_empresas_mes;

alter table public.unidades
  drop column empresas_vencidas,
  drop column empresas_exclusiva_tst,
  drop column clientes_ativos;
comment on table public.unidades is 'Unidades/filiais. A demanda por mês fica em demanda_mensal; clientes ativos em unidade_mes.';
