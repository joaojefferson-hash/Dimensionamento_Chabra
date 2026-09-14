-- ============================================================================
-- Chabra Dimensiona — 0007_empresas_por_mes
-- Quantidade de empresas por unidade pode variar por mês.
--   * unidades.empresas_* continuam sendo o PADRÃO da unidade
--   * unidade_empresas_mes guarda a exceção de um mês (todas as três graus);
--     sem linha para o mês → vale o padrão
--   * importar_backup v4 (unidades[].empresasPorMes)
-- ============================================================================

create table public.unidade_empresas_mes (
  unidade_id     uuid not null references public.unidades(id) on delete cascade,
  mes            smallint not null check (mes between 1 and 12),
  empresas_baixo integer not null default 0 check (empresas_baixo >= 0),
  empresas_medio integer not null default 0 check (empresas_medio >= 0),
  empresas_alto  integer not null default 0 check (empresas_alto  >= 0),
  updated_at     timestamptz not null default now(),
  primary key (unidade_id, mes)
);
comment on table public.unidade_empresas_mes is 'Exceção mensal da quantidade de empresas por grau; meses sem linha usam o padrão da unidade.';
create trigger unidade_empresas_mes_set_updated_at
  before update on public.unidade_empresas_mes
  for each row execute function public.set_updated_at();

alter table public.unidade_empresas_mes enable row level security;
create policy "equipe: ler empresas_mes"      on public.unidade_empresas_mes for select to authenticated using (true);
create policy "equipe: inserir empresas_mes"  on public.unidade_empresas_mes for insert to authenticated with check (true);
create policy "equipe: atualizar empresas_mes" on public.unidade_empresas_mes for update to authenticated using (true) with check (true);
create policy "equipe: excluir empresas_mes"  on public.unidade_empresas_mes for delete to authenticated using (true);
revoke all on table public.unidade_empresas_mes from anon, public;
grant select, insert, update, delete on table public.unidade_empresas_mes to authenticated;
revoke truncate, references, trigger on table public.unidade_empresas_mes from authenticated;

-- ---------------------------------------------------------------------------
-- importar_backup v4
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

  insert into public.unidades (nome, empresas_baixo, empresas_medio, empresas_alto, created_at)
  select btrim(e.elem->>'nome'),
         greatest(0, round(coalesce(nullif(e.elem->>'empresasBaixo', ''), nullif(e.elem->>'empresas', ''), '0')::numeric))::int,
         greatest(0, round(coalesce(nullif(e.elem->>'empresasMedio', ''), '0')::numeric))::int,
         greatest(0, round(coalesce(nullif(e.elem->>'empresasAlto',  ''), '0')::numeric))::int,
         now() + (e.n * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p->'unidades', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> '';

  -- variação mensal: unidades[].empresasPorMes = [{mes, empresasBaixo, empresasMedio, empresasAlto}]
  insert into public.unidade_empresas_mes (unidade_id, mes, empresas_baixo, empresas_medio, empresas_alto)
  select u.id,
         (m->>'mes')::int,
         greatest(0, round(coalesce(nullif(m->>'empresasBaixo', ''), '0')::numeric))::int,
         greatest(0, round(coalesce(nullif(m->>'empresasMedio', ''), '0')::numeric))::int,
         greatest(0, round(coalesce(nullif(m->>'empresasAlto',  ''), '0')::numeric))::int
  from jsonb_array_elements(coalesce(p->'unidades', '[]'::jsonb)) with ordinality as e(elem, n)
  join public.unidades u on u.created_at = now() + (e.n * interval '1 millisecond')
  cross join lateral jsonb_array_elements(case when jsonb_typeof(e.elem->'empresasPorMes') = 'array' then e.elem->'empresasPorMes' else '[]'::jsonb end) as m
  where (m->>'mes') ~ '^\d{1,2}$' and (m->>'mes')::int between 1 and 12
  on conflict (unidade_id, mes) do nothing;

  insert into public.documentos (nome, horas, periodicidade_meses, responsavel, created_at)
  select btrim(e.elem->>'nome'),
         greatest(0, coalesce(nullif(e.elem->>'horas', ''), '0')::numeric),
         greatest(0, round(coalesce(nullif(e.elem->>'periodicidadeMeses', ''), '0')::numeric))::int,
         case when e.elem->>'responsavel' = 'Administrativo' then 'Administrativo'
              else 'Técnico de Segurança do Trabalho' end,
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

  insert into public.colaborador_unidades (colaborador_id, unidade_id, percentual)
  select c.id, u.id, least(100, round(a.pct, 2))
  from jsonb_array_elements(coalesce(p->'colaboradores', '[]'::jsonb)) with ordinality as e(elem, n)
  join public.colaboradores c on c.created_at = now() + (e.n * interval '1 millisecond')
  cross join lateral (
    select btrim(x->>'unidadeNome') as unome, coalesce((x->>'percentual')::numeric, 0) as pct
      from jsonb_array_elements(case when jsonb_typeof(e.elem->'alocacoes') = 'array' then e.elem->'alocacoes' else '[]'::jsonb end) as x
    union all
    select btrim(e.elem->>'unidadeNome'), 100
     where jsonb_typeof(e.elem->'alocacoes') <> 'array' or e.elem->'alocacoes' is null
  ) as a
  join public.unidades u on lower(btrim(u.nome)) = lower(a.unome)
  where btrim(coalesce(e.elem->>'nome', '')) <> '' and a.pct > 0
  on conflict (colaborador_id, unidade_id) do nothing;

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
