-- ============================================================================
-- Chabra Dimensiona — 0003_fase2_dimensionamento
-- Fase 2 (motor de cálculo):
--   * unidades: empresas segmentadas por grau de dificuldade (baixo/médio/alto);
--     "empresas" vira coluna gerada = soma dos três graus
--   * documentos: responsável (quem produz: técnico ou administrativo)
--   * colaboradores: vínculo com unidade
--   * parametros (linha única): calendário de dias úteis, fatores por grau,
--     dias úteis de referência, ocupação-alvo
--   * importar_backup: aceita o formato novo (e o antigo, mapeando o total
--     de empresas para o grau baixo)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- unidades: empresas por grau
-- ---------------------------------------------------------------------------
alter table public.unidades
  add column empresas_baixo integer not null default 0 check (empresas_baixo >= 0),
  add column empresas_medio integer not null default 0 check (empresas_medio >= 0),
  add column empresas_alto  integer not null default 0 check (empresas_alto  >= 0);

-- dados antigos: o total vai para grau baixo (fator 1,0 = comportamento anterior)
update public.unidades set empresas_baixo = empresas;

alter table public.unidades drop column empresas;
alter table public.unidades
  add column empresas integer generated always as (empresas_baixo + empresas_medio + empresas_alto) stored;

comment on column public.unidades.empresas_baixo is 'Empresas-cliente de grau de dificuldade BAIXO';
comment on column public.unidades.empresas_medio is 'Empresas-cliente de grau de dificuldade MÉDIO';
comment on column public.unidades.empresas_alto  is 'Empresas-cliente de grau de dificuldade ALTO';
comment on column public.unidades.empresas       is 'Total de empresas-cliente (gerado = baixo + médio + alto)';

-- ---------------------------------------------------------------------------
-- documentos: quem produz
-- ---------------------------------------------------------------------------
alter table public.documentos
  add column responsavel text not null default 'Técnico de Segurança do Trabalho'
    check (responsavel in ('Técnico de Segurança do Trabalho', 'Administrativo'));
comment on column public.documentos.responsavel is 'Função que produz o documento (define de qual capacidade a demanda é abatida)';

-- ---------------------------------------------------------------------------
-- colaboradores: unidade
-- ---------------------------------------------------------------------------
alter table public.colaboradores
  add column unidade_id uuid references public.unidades(id) on delete set null;
create index colaboradores_unidade_id_idx on public.colaboradores (unidade_id);
comment on column public.colaboradores.unidade_id is 'Unidade em que o colaborador está alocado (null = não conta na capacidade de nenhuma unidade)';

-- ---------------------------------------------------------------------------
-- parametros: linha única de configuração do motor
-- ---------------------------------------------------------------------------
create table public.parametros (
  id              smallint primary key default 1 check (id = 1),
  -- dias úteis por mês (jan..dez). Padrão 2026: dias de semana menos feriados nacionais.
  dias_uteis      integer[] not null default '{21,18,22,20,20,21,23,21,21,21,19,22}'
                    check (array_length(dias_uteis, 1) = 12 and 0 <= all(dias_uteis) and 31 >= all(dias_uteis)),
  fator_baixo     numeric(4,2) not null default 1.0 check (fator_baixo > 0),
  fator_medio     numeric(4,2) not null default 1.3 check (fator_medio > 0),
  fator_alto      numeric(4,2) not null default 1.6 check (fator_alto  > 0),
  -- a capacidade mensal cadastrada no colaborador equivale a este nº de dias úteis
  dias_referencia integer not null default 20 check (dias_referencia > 0 and dias_referencia <= 31),
  -- % da capacidade considerada "planejável" no cálculo do gap
  ocupacao_alvo   numeric(5,2) not null default 85 check (ocupacao_alvo > 0 and ocupacao_alvo <= 100),
  updated_at      timestamptz not null default now()
);
comment on table public.parametros is 'Parâmetros do motor de dimensionamento (linha única, id = 1).';
create trigger parametros_set_updated_at
  before update on public.parametros
  for each row execute function public.set_updated_at();

insert into public.parametros default values;

alter table public.parametros enable row level security;
create policy "equipe: ler parametros"      on public.parametros for select to authenticated using (true);
create policy "equipe: atualizar parametros" on public.parametros for update to authenticated using (true) with check (true);

revoke all on table public.parametros from anon, public;
grant select, update on table public.parametros to authenticated;

-- ---------------------------------------------------------------------------
-- importar_backup v2
-- ---------------------------------------------------------------------------
create or replace function public.importar_backup(p jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  par jsonb := p->'parametros';
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

  -- unidades (formato novo: empresasBaixo/Medio/Alto; antigo: empresas → baixo)
  insert into public.unidades (nome, empresas_baixo, empresas_medio, empresas_alto, created_at)
  select btrim(e.elem->>'nome'),
         greatest(0, round(coalesce(nullif(e.elem->>'empresasBaixo', ''), nullif(e.elem->>'empresas', ''), '0')::numeric))::int,
         greatest(0, round(coalesce(nullif(e.elem->>'empresasMedio', ''), '0')::numeric))::int,
         greatest(0, round(coalesce(nullif(e.elem->>'empresasAlto',  ''), '0')::numeric))::int,
         now() + (e.n * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p->'unidades', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> '';

  insert into public.documentos (nome, horas, periodicidade_meses, responsavel, created_at)
  select btrim(e.elem->>'nome'),
         greatest(0, coalesce(nullif(e.elem->>'horas', ''), '0')::numeric),
         greatest(0, round(coalesce(nullif(e.elem->>'periodicidadeMeses', ''), '0')::numeric))::int,
         case when e.elem->>'responsavel' = 'Administrativo' then 'Administrativo'
              else 'Técnico de Segurança do Trabalho' end,
         now() + (e.n * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p->'documentos', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> '';

  -- colaboradores: a unidade é resolvida pelo nome (ids mudam a cada importação)
  insert into public.colaboradores (nome, funcao, horas_mes, eficiencia, unidade_id, created_at)
  select btrim(e.elem->>'nome'),
         case when e.elem->>'funcao' = 'Administrativo' then 'Administrativo'
              else 'Técnico de Segurança do Trabalho' end,
         greatest(0, coalesce(nullif(e.elem->>'horasMes', ''), '160')::numeric),
         least(100, greatest(1, coalesce(nullif(e.elem->>'eficiencia', ''), '80')::numeric)),
         (select u.id from public.unidades u
           where lower(btrim(u.nome)) = lower(btrim(coalesce(e.elem->>'unidadeNome', '')))
           limit 1),
         now() + (e.n * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p->'colaboradores', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> '';

  -- parâmetros (opcional no backup)
  if par is not null and jsonb_typeof(par) = 'object' then
    update public.parametros set
      dias_uteis      = coalesce((select array_agg(greatest(0, least(31, round(x::numeric)::int)) order by ord)
                                    from jsonb_array_elements_text(par->'diasUteis') with ordinality as t(x, ord)
                                   where jsonb_typeof(par->'diasUteis') = 'array' and jsonb_array_length(par->'diasUteis') = 12),
                                 dias_uteis),
      fator_baixo     = coalesce(nullif(par->>'fatorBaixo', '')::numeric, fator_baixo),
      fator_medio     = coalesce(nullif(par->>'fatorMedio', '')::numeric, fator_medio),
      fator_alto      = coalesce(nullif(par->>'fatorAlto',  '')::numeric, fator_alto),
      dias_referencia = coalesce(round(nullif(par->>'diasReferencia', '')::numeric)::int, dias_referencia),
      ocupacao_alvo   = coalesce(nullif(par->>'ocupacaoAlvo', '')::numeric, ocupacao_alvo)
    where id = 1;
  end if;
end;
$$;
