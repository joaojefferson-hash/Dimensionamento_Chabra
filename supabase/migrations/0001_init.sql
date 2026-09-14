-- ============================================================================
-- Chabra Dimensiona — 0001_init
-- Schema inicial (Fase 1 na nuvem): unidades, documentos, colaboradores.
--
-- Modelo de acesso: SINGLE-TENANT. Toda a equipe autenticada compartilha os
-- mesmos cadastros — por isso as policies são "to authenticated using (true)".
-- Usuários são criados pelo admin no dashboard; o signup público DEVE ficar
-- desligado (Authentication → Sign In / Providers → Email → "Allow new users
-- to sign up" = off), senão qualquer pessoa com a chave publishable vira
-- "authenticated".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.unidades (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (btrim(nome) <> ''),
  empresas   integer not null default 0 check (empresas >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.unidades is 'Unidades/filiais da consultoria. "empresas" = quantidade de empresas-cliente atendidas (não é cadastro individual).';
create unique index unidades_nome_key on public.unidades (lower(btrim(nome)));
create trigger unidades_set_updated_at
  before update on public.unidades
  for each row execute function public.set_updated_at();

create table public.documentos (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null check (btrim(nome) <> ''),
  horas               numeric(8,2) not null default 0 check (horas >= 0),
  periodicidade_meses integer not null default 0 check (periodicidade_meses >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.documentos is 'Catálogo de tipos de documento SST. horas = tempo médio de elaboração; periodicidade_meses = 0 significa "sob demanda".';
create unique index documentos_nome_key on public.documentos (lower(btrim(nome)));
create trigger documentos_set_updated_at
  before update on public.documentos
  for each row execute function public.set_updated_at();

create table public.colaboradores (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (btrim(nome) <> ''),
  funcao     text not null check (funcao in ('Técnico de Segurança do Trabalho', 'Administrativo')),
  horas_mes  numeric(8,2) not null default 160 check (horas_mes >= 0),
  eficiencia numeric(5,2) not null default 80 check (eficiencia > 0 and eficiencia <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.colaboradores is 'Equipe. horas_mes = capacidade produtiva (horas úteis/mês); eficiencia em % (padrão 80).';
create trigger colaboradores_set_updated_at
  before update on public.colaboradores
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — equipe autenticada acessa tudo (single-tenant)
-- ---------------------------------------------------------------------------
alter table public.unidades      enable row level security;
alter table public.documentos    enable row level security;
alter table public.colaboradores enable row level security;

create policy "equipe: ler unidades"      on public.unidades for select to authenticated using (true);
create policy "equipe: inserir unidades"  on public.unidades for insert to authenticated with check (true);
create policy "equipe: atualizar unidades" on public.unidades for update to authenticated using (true) with check (true);
create policy "equipe: excluir unidades"  on public.unidades for delete to authenticated using (true);

create policy "equipe: ler documentos"      on public.documentos for select to authenticated using (true);
create policy "equipe: inserir documentos"  on public.documentos for insert to authenticated with check (true);
create policy "equipe: atualizar documentos" on public.documentos for update to authenticated using (true) with check (true);
create policy "equipe: excluir documentos"  on public.documentos for delete to authenticated using (true);

create policy "equipe: ler colaboradores"      on public.colaboradores for select to authenticated using (true);
create policy "equipe: inserir colaboradores"  on public.colaboradores for insert to authenticated with check (true);
create policy "equipe: atualizar colaboradores" on public.colaboradores for update to authenticated using (true) with check (true);
create policy "equipe: excluir colaboradores"  on public.colaboradores for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Data API — expor SÓ para authenticated. Desde 2026-04 tabelas novas não são
-- expostas automaticamente, então os grants precisam ser explícitos.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
revoke all on table public.unidades, public.documentos, public.colaboradores from anon, public;
grant select, insert, update, delete on table public.unidades, public.documentos, public.colaboradores to authenticated;

-- ---------------------------------------------------------------------------
-- Importação de backup (Importar JSON / migração dos dados locais):
-- substitui TODOS os cadastros em uma única transação.
-- Aceita o mesmo JSON que o app exporta (chaves camelCase).
-- ---------------------------------------------------------------------------
create or replace function public.importar_backup(p jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Backup inválido' using errcode = '22023';
  end if;

  delete from public.colaboradores;
  delete from public.documentos;
  delete from public.unidades;

  -- created_at escalonado por posição para preservar a ordem do arquivo
  insert into public.unidades (nome, empresas, created_at)
  select btrim(e.elem->>'nome'),
         greatest(0, round(coalesce(nullif(e.elem->>'empresas', ''), '0')::numeric))::int,
         now() + (e.n * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p->'unidades', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> '';

  insert into public.documentos (nome, horas, periodicidade_meses, created_at)
  select btrim(e.elem->>'nome'),
         greatest(0, coalesce(nullif(e.elem->>'horas', ''), '0')::numeric),
         greatest(0, round(coalesce(nullif(e.elem->>'periodicidadeMeses', ''), '0')::numeric))::int,
         now() + (e.n * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p->'documentos', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> '';

  insert into public.colaboradores (nome, funcao, horas_mes, eficiencia, created_at)
  select btrim(e.elem->>'nome'),
         case when e.elem->>'funcao' = 'Administrativo' then 'Administrativo'
              else 'Técnico de Segurança do Trabalho' end,
         greatest(0, coalesce(nullif(e.elem->>'horasMes', ''), '160')::numeric),
         least(100, greatest(1, coalesce(nullif(e.elem->>'eficiencia', ''), '80')::numeric)),
         now() + (e.n * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p->'colaboradores', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> '';
end;
$$;

revoke execute on function public.importar_backup(jsonb) from public, anon;
grant execute on function public.importar_backup(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed: catálogo padrão (valores iniciais são sugestões, editáveis no app)
-- ---------------------------------------------------------------------------
insert into public.documentos (nome, horas, periodicidade_meses, created_at)
select v.nome, v.horas, v.periodicidade_meses, now() + (v.ord * interval '1 millisecond')
from (values
  (1, 'PGR',                           16, 24),
  (2, 'AET',                           12, 24),
  (3, 'Laudo de Insalubridade',         8, 12),
  (4, 'Laudo de Periculosidade',        8, 12),
  (5, 'LTCAT',                          8, 12),
  (6, 'Investigação de Acidente',       6,  0),
  (7, 'Relatório de Não Conformidade',  2,  1),
  (8, 'Treinamento',                    4, 12)
) as v(ord, nome, horas, periodicidade_meses);
