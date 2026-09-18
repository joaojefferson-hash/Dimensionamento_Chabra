-- 0030 — Sincronização com a API de documentos SST da Chabra
--   * unidades.codigo_api: liga a unidade do cadastro à unidade da API (slug)
--   * clientes_porte.cnpj e .condicao: porte e condição continuam sendo classificação nossa
--     (a API não informa), agora casáveis por CNPJ
--   * sincronizacao_sst: registro de cada execução, por unidade (frescor e cobertura)
--   * aplicar_sincronizacao_sst(): grava demanda e atendidas em uma transação
-- A Edge Function `sincronizar-sst` consome a API (credenciais como segredos no servidor),
-- monta o lote com supabase/functions/sincronizar-sst/transformar.js e chama esta função.

alter table public.unidades add column if not exists codigo_api text;
create unique index if not exists unidades_codigo_api_idx on public.unidades (codigo_api) where codigo_api is not null;
comment on column public.unidades.codigo_api is 'Unidade correspondente na API de documentos (ex.: teresopolis). Nulo = só importação manual.';

alter table public.clientes_porte add column if not exists cnpj text;
alter table public.clientes_porte add column if not exists condicao text
  check (condicao is null or condicao in ('mensal', 'exclusiva_tst', 'sem_avaliacao', 'contrato_novo'));
create index if not exists clientes_porte_cnpj_idx on public.clientes_porte (cnpj) where cnpj is not null;

create table if not exists public.sincronizacao_sst (
  id            bigint generated always as identity primary key,
  executado_em  timestamptz not null default now(),
  ano           integer not null,
  unidade_id    uuid references public.unidades(id) on delete set null,
  codigo_api    text,
  cobertura     text,
  ultima_varredura_em timestamptz,
  documentos    integer not null default 0,
  demanda_gravada integer not null default 0,
  atendidas_gravadas integer not null default 0,
  aplicada      boolean not null default false,
  mensagem      text
);
alter table public.sincronizacao_sst enable row level security;
drop policy if exists "equipe: ler sincronizacao" on public.sincronizacao_sst;
create policy "equipe: ler sincronizacao" on public.sincronizacao_sst for select to authenticated using (true);

-- corpo completo da função: ver o banco (aplicada por MCP em 18/09/2026) — resumo:
--   valida admin (ou service role), substitui a demanda do ano das unidades aplicáveis,
--   grava as atendidas por porte preservando clientes_ativos e registra o log por unidade.
