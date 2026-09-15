-- ============================================================================
-- Chabra Dimensiona — REESCRITA · ETAPA 1 · Schema PostgreSQL (Supabase)
--
-- Proposta. Ainda não aplicada. Escrita para rodar de duas formas:
--   (a) como migração sobre o banco atual (bloco "MIGRAÇÃO DOS DADOS" no fim), ou
--   (b) como schema de um projeto novo (basta pular o bloco de migração).
--
-- Novas regras cobertas:
--   1. Ramp-up de contratações  → colaboradores.data_admissao + parametros.rampup
--   2. Porte do cliente (P/M/G) → tabela portes (peso) + demanda_mensal por condição × porte
--   3. Impacto financeiro       → funcoes.custo_mensal (+ override por colaborador)
-- Extras que resolvem dores atuais:
--   • data_admissao / data_desligamento → a equipe de cada mês passa a ser a real
--     (hoje o histórico é projetado com "a equipe de hoje")
--   • cenarios → simulações "E se…?" salvas no banco e compartilháveis com a diretoria
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Tipos
-- ----------------------------------------------------------------------------
create type public.papel_usuario   as enum ('admin', 'supervisor', 'leitura');
create type public.tipo_producao   as enum ('tecnico', 'administrativo', 'nenhuma');
create type public.escopo_chefia   as enum ('todos', 'tecnicos', 'administrativos');
create type public.condicao_cliente as enum ('mensal', 'exclusiva_tst');

-- ----------------------------------------------------------------------------
-- 1. Papéis (lidos do JWT: auth.users.raw_app_meta_data.papel — como hoje)
-- ----------------------------------------------------------------------------
create or replace function public.papel_atual() returns public.papel_usuario
language sql stable as $$
  select case coalesce(auth.jwt() -> 'app_metadata' ->> 'papel', '')
           when 'admin'      then 'admin'::public.papel_usuario
           when 'supervisor' then 'supervisor'::public.papel_usuario
           when 'leitura'    then 'leitura'::public.papel_usuario
           else null end
$$;
create or replace function public.pode_ver()    returns boolean language sql stable as $$ select public.papel_atual() is not null $$;
create or replace function public.pode_editar() returns boolean language sql stable as $$ select public.papel_atual() in ('admin', 'supervisor') $$;
create or replace function public.is_admin()    returns boolean language sql stable as $$ select public.papel_atual() = 'admin' $$;

-- ----------------------------------------------------------------------------
-- 2. Cadastros
-- ----------------------------------------------------------------------------
create table public.unidades (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (btrim(nome) <> ''),
  ativa       boolean not null default true,              -- desativar sem apagar histórico
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.unidades is 'Unidades/filiais. A demanda fica em demanda_mensal; o informativo em unidade_mes.';

create table public.portes (
  codigo  text primary key,                                -- 'P', 'M', 'G' (dá para criar outros sem DDL)
  nome    text not null,
  peso    numeric(4,2) not null check (peso > 0),          -- multiplica o esforço: P 1.0 · M 1.5 · G 2.0
  ordem   smallint not null default 0
);
comment on table public.portes is 'Porte/complexidade do cliente. peso multiplica o esforço de cada empresa (inspeção, relatório, finalização).';
insert into public.portes (codigo, nome, peso, ordem) values
  ('P', 'Pequeno', 1.00, 1), ('M', 'Médio', 1.50, 2), ('G', 'Grande', 2.00, 3);

create table public.demanda_mensal (
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  ano         smallint not null check (ano between 2000 and 2100),
  mes         smallint not null check (mes between 1 and 12),
  condicao    public.condicao_cliente not null,
  porte       text not null references public.portes(codigo),
  quantidade  integer not null default 0 check (quantidade >= 0),
  updated_at  timestamptz not null default now(),
  primary key (unidade_id, ano, mes, condicao, porte)
);
comment on table public.demanda_mensal is
  'Quantos clientes VENCEM no mês, por unidade, condição e porte. Só o que vence naquele mês (nos passados, o que venceu e ainda está em aberto); o acumulado é calculado pelo motor.';
create index demanda_mensal_ano_mes on public.demanda_mensal (ano, mes);

create table public.unidade_mes (
  unidade_id       uuid not null references public.unidades(id) on delete cascade,
  ano              smallint not null check (ano between 2000 and 2100),
  mes              smallint not null check (mes between 1 and 12),
  clientes_ativos  integer not null default 0 check (clientes_ativos >= 0),   -- informativo, fora das contas
  updated_at       timestamptz not null default now(),
  primary key (unidade_id, ano, mes)
);

create table public.funcoes (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (btrim(nome) <> ''),
  tipo_producao  public.tipo_producao not null default 'nenhuma',
  chefia         boolean not null default false,
  coordena       public.escopo_chefia not null default 'todos',
  responde_para  uuid references public.funcoes(id) on delete set null,
  ordem          integer not null default 0,
  custo_mensal   numeric(12,2) not null default 0 check (custo_mensal >= 0),  -- NOVO: custo médio mensal de 1 pessoa (salário + encargos)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (responde_para is distinct from id)
);
comment on column public.funcoes.custo_mensal is 'Custo médio mensal de uma pessoa nesta função (salário + encargos). Base do impacto financeiro.';

create table public.colaboradores (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null check (btrim(nome) <> ''),
  funcao_id          uuid references public.funcoes(id) on delete set null,
  inspecoes_dia      numeric(6,2) not null default 2 check (inspecoes_dia >= 0),
  relatorios_dia     numeric(6,2) not null default 1 check (relatorios_dia >= 0),
  empresas_dia       numeric(6,2) not null default 1 check (empresas_dia >= 0),
  data_admissao      date,                                 -- NOVO: ramp-up conta a partir daqui (null = veterano, 100%)
  data_desligamento  date,                                 -- NOVO: sai da equipe a partir deste mês
  custo_mensal       numeric(12,2) check (custo_mensal >= 0),  -- NOVO (opcional): sobrepõe o custo médio da função
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (data_desligamento is null or data_admissao is null or data_desligamento >= data_admissao)
);
comment on column public.colaboradores.data_admissao is 'Ramp-up: mês 1 = rampup[1]%, mês 2 = rampup[2]%, depois 100%. Sem data = 100% desde sempre.';

create table public.colaborador_unidades (
  colaborador_id  uuid not null references public.colaboradores(id) on delete cascade,
  unidade_id      uuid not null references public.unidades(id) on delete cascade,
  percentual      numeric(5,2) not null check (percentual > 0 and percentual <= 100),
  created_at      timestamptz not null default now(),
  primary key (colaborador_id, unidade_id)
);

-- Σ percentual por colaborador ≤ 100 (hoje é só comentário; vira regra)
create or replace function public.checar_alocacao_total() returns trigger
language plpgsql as $$
declare total numeric;
begin
  select coalesce(sum(percentual), 0) into total
    from public.colaborador_unidades where colaborador_id = new.colaborador_id;
  if total > 100.0001 then
    raise exception 'A soma das alocações de % passa de 100%% (%).', new.colaborador_id, total;
  end if;
  return null;
end $$;
create constraint trigger colaborador_unidades_total
  after insert or update on public.colaborador_unidades
  deferrable initially deferred for each row execute function public.checar_alocacao_total();

-- ----------------------------------------------------------------------------
-- 3. Parâmetros (linha única)
-- ----------------------------------------------------------------------------
create table public.parametros (
  id              smallint primary key default 1 check (id = 1),
  dias_uteis      integer[] not null default '{21,18,22,20,20,21,23,21,21,21,19,22}'
                  check (array_length(dias_uteis, 1) = 12 and 0 <= all(dias_uteis) and 31 >= all(dias_uteis)),
  ocupacao_alvo   numeric(5,2) not null default 85 check (ocupacao_alvo > 0 and ocupacao_alvo <= 100),  -- folga = 100 − isto
  prazo_dias      integer not null default 60 check (prazo_dias between 1 and 365),
  margem_atencao  numeric(5,2) not null default 10 check (margem_atencao >= 0 and margem_atencao < 100), -- "no limite" = sobra < 10%
  rampup          integer[] not null default '{50,80}'      -- NOVO: % de produção no 1º, 2º… mês; depois 100
                  check (array_length(rampup, 1) between 0 and 12 and 0 <= all(rampup) and 100 >= all(rampup)),
  updated_at      timestamptz not null default now()
);
insert into public.parametros (id) values (1);

-- ----------------------------------------------------------------------------
-- 4. Cenários "E se…?" (opcional, mas resolve "simulação só no meu navegador")
-- ----------------------------------------------------------------------------
create table public.cenarios (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (btrim(nome) <> ''),
  descricao   text,
  criado_por  uuid not null default auth.uid(),
  criado_em   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  itens       jsonb not null default '[]'::jsonb
  -- item: { "unidade_id": uuid, "funcao_id": uuid, "quantidade": int (+contratar/−desligar),
  --         "de": 0..11, "ate": 0..11, "inspecoes_dia"?, "relatorios_dia"?, "empresas_dia"? }
  -- funcao_id (em vez de só o grupo) dá o custo e o tipo de produção da pessoa simulada.
);

-- ----------------------------------------------------------------------------
-- 5. Histórico (audit trail) — igual ao atual
-- ----------------------------------------------------------------------------
create table public.historico (
  id             bigint generated always as identity primary key,
  quando         timestamptz not null default now(),
  usuario_id     uuid,
  usuario_nome   text,
  usuario_email  text,
  tabela         text not null,
  operacao       text not null check (operacao in ('insert', 'update', 'delete', 'importacao')),
  registro_id    text,
  antes          jsonb,
  depois         jsonb
);
create index historico_quando on public.historico (quando desc);
create index historico_tabela on public.historico (tabela, quando desc);

create or replace function public.registrar_historico() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nome text; email text; rid text;
begin
  select coalesce(u.raw_user_meta_data ->> 'nome', ''), u.email into nome, email from auth.users u where u.id = uid;
  rid := coalesce(to_jsonb(coalesce(new, old)) ->> 'id',
                  concat_ws('/', to_jsonb(coalesce(new, old)) ->> 'unidade_id', to_jsonb(coalesce(new, old)) ->> 'colaborador_id',
                            to_jsonb(coalesce(new, old)) ->> 'ano', to_jsonb(coalesce(new, old)) ->> 'mes'));
  insert into public.historico (usuario_id, usuario_nome, usuario_email, tabela, operacao, registro_id, antes, depois)
  values (uid, nome, email, tg_table_name, lower(tg_op), rid,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

do $$ declare t text;
begin
  foreach t in array array['unidades','portes','demanda_mensal','unidade_mes','funcoes','colaboradores','colaborador_unidades','parametros'] loop
    execute format('create trigger %I_historico after insert or update or delete on public.%I for each row execute function public.registrar_historico()', t, t);
  end loop;
end $$;

-- updated_at automático
create or replace function public.tocar_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
do $$ declare t text;
begin
  foreach t in array array['unidades','demanda_mensal','unidade_mes','funcoes','colaboradores','parametros','cenarios'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.tocar_updated_at()', t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 6. Views de apoio (o motor calcula tudo no cliente; as views servem a relatórios/SQL)
-- ----------------------------------------------------------------------------
create view public.v_demanda_ponderada as
  select d.unidade_id, d.ano, d.mes, d.condicao,
         sum(d.quantidade)            as empresas,
         sum(d.quantidade * p.peso)   as empresas_ponderadas
    from public.demanda_mensal d join public.portes p on p.codigo = d.porte
   group by d.unidade_id, d.ano, d.mes, d.condicao;

-- ----------------------------------------------------------------------------
-- 7. RLS
--   leitura: qualquer papel · escrita nos cadastros: admin e supervisor ·
--   cenários: dono ou admin · histórico: só leitura (escrita pelos gatilhos, security definer)
-- ----------------------------------------------------------------------------
do $$ declare t text;
begin
  foreach t in array array['unidades','portes','demanda_mensal','unidade_mes','funcoes','colaboradores','colaborador_unidades','parametros'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.pode_ver())', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.pode_editar())', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.pode_editar()) with check (public.pode_editar())', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.pode_editar())', t, t);
  end loop;
end $$;
-- parâmetros: linha única — ninguém insere/apaga pela API
drop policy parametros_insert on public.parametros;
drop policy parametros_delete on public.parametros;

alter table public.cenarios enable row level security;
create policy cenarios_select on public.cenarios for select to authenticated using (public.pode_ver());
create policy cenarios_insert on public.cenarios for insert to authenticated with check (public.pode_ver() and criado_por = auth.uid());
create policy cenarios_update on public.cenarios for update to authenticated using (criado_por = auth.uid() or public.is_admin()) with check (criado_por = auth.uid() or public.is_admin());
create policy cenarios_delete on public.cenarios for delete to authenticated using (criado_por = auth.uid() or public.is_admin());

alter table public.historico enable row level security;
create policy historico_select on public.historico for select to authenticated using (public.pode_ver());
-- sem policies de escrita: só o gatilho (security definer) grava

-- ----------------------------------------------------------------------------
-- 8. Backup: importar_backup(jsonb) continua admin-only e passa a cobrir
--    portes, demanda_mensal, unidade_mes, cenarios (corpo na Etapa 2 dos serviços).
-- ----------------------------------------------------------------------------

commit;

-- ============================================================================
-- MIGRAÇÃO DOS DADOS (só para o caminho (a): banco atual → schema novo)
-- Rodar ANTES de apagar as tabelas/colunas antigas. Porte 'P' (peso 1,0) mantém
-- todos os números de hoje exatamente iguais.
-- ============================================================================
-- insert into public.demanda_mensal (unidade_id, ano, mes, condicao, porte, quantidade)
--   select unidade_id, ano, mes, 'mensal', 'P', empresas_vencidas
--     from public.unidade_empresas_mes where empresas_vencidas > 0
--   union all
--   select unidade_id, ano, mes, 'exclusiva_tst', 'P', empresas_exclusiva_tst
--     from public.unidade_empresas_mes where empresas_exclusiva_tst > 0;
-- insert into public.unidade_mes (unidade_id, ano, mes, clientes_ativos)
--   select unidade_id, ano, mes, clientes_ativos from public.unidade_empresas_mes;
-- alter table public.funcoes        alter column tipo_producao type public.tipo_producao using tipo_producao::public.tipo_producao;
-- alter table public.funcoes        alter column coordena      type public.escopo_chefia using coordena::public.escopo_chefia;
-- alter table public.funcoes        add column custo_mensal numeric(12,2) not null default 0;
-- alter table public.colaboradores  add column data_admissao date, add column data_desligamento date, add column custo_mensal numeric(12,2);
-- alter table public.parametros     add column rampup integer[] not null default '{50,80}', add column margem_atencao numeric(5,2) not null default 10;
-- alter table public.unidades       drop column empresas_vencidas, drop column empresas_exclusiva_tst, drop column clientes_ativos;
-- drop table public.unidade_empresas_mes;
-- drop table public.documentos;   -- catálogo oculto, fora do modelo
