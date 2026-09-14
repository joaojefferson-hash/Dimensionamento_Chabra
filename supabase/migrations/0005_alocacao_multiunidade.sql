-- ============================================================================
-- Chabra Dimensiona — 0005_alocacao_multiunidade
-- Colaborador pode atuar em mais de uma unidade, com percentual de dedicação
-- (soma ≤ 100%). Substitui colaboradores.unidade_id.
--   * colaborador_unidades (colaborador_id, unidade_id, percentual)
--   * migra vínculos existentes como 100%
--   * RPC definir_alocacoes(colaborador, jsonb) — troca atômica
--   * importar_backup v3 (alocacoes por nome de unidade; unidadeNome legado = 100%)
-- ============================================================================

create table public.colaborador_unidades (
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  unidade_id     uuid not null references public.unidades(id) on delete cascade,
  percentual     numeric(5,2) not null check (percentual > 0 and percentual <= 100),
  created_at     timestamptz not null default now(),
  primary key (colaborador_id, unidade_id)
);
comment on table public.colaborador_unidades is 'Alocação do colaborador por unidade: percentual da capacidade dedicado àquela unidade (soma por colaborador ≤ 100).';
create index colaborador_unidades_unidade_idx on public.colaborador_unidades (unidade_id);

-- soma por colaborador nunca passa de 100%
create or replace function public.checar_soma_alocacoes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare total numeric;
begin
  select coalesce(sum(percentual), 0) into total
    from public.colaborador_unidades where colaborador_id = new.colaborador_id;
  if total > 100.0001 then
    raise exception 'A soma das alocações do colaborador não pode passar de 100%% (atual: %%%)', total
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger colaborador_unidades_soma
  after insert or update on public.colaborador_unidades
  for each row execute function public.checar_soma_alocacoes();

-- vínculos atuais → 100% na unidade
insert into public.colaborador_unidades (colaborador_id, unidade_id, percentual)
select id, unidade_id, 100 from public.colaboradores where unidade_id is not null;

alter table public.colaboradores drop column unidade_id;

-- RLS / grants
alter table public.colaborador_unidades enable row level security;
create policy "equipe: ler alocacoes"      on public.colaborador_unidades for select to authenticated using (true);
create policy "equipe: inserir alocacoes"  on public.colaborador_unidades for insert to authenticated with check (true);
create policy "equipe: atualizar alocacoes" on public.colaborador_unidades for update to authenticated using (true) with check (true);
create policy "equipe: excluir alocacoes"  on public.colaborador_unidades for delete to authenticated using (true);
revoke all on table public.colaborador_unidades from anon, public;
grant select, insert, update, delete on table public.colaborador_unidades to authenticated;
revoke truncate, references, trigger on table public.colaborador_unidades from authenticated;

-- ---------------------------------------------------------------------------
-- definir_alocacoes: substitui todas as alocações de um colaborador
--   p_alocacoes = [{ "unidadeId": uuid, "percentual": number }, ...]
-- ---------------------------------------------------------------------------
create or replace function public.definir_alocacoes(p_colaborador uuid, p_alocacoes jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.colaboradores where id = p_colaborador) then
    raise exception 'Colaborador não encontrado' using errcode = 'P0002';
  end if;

  delete from public.colaborador_unidades where colaborador_id = p_colaborador;

  insert into public.colaborador_unidades (colaborador_id, unidade_id, percentual)
  select p_colaborador,
         (e.elem->>'unidadeId')::uuid,
         least(100, round((e.elem->>'percentual')::numeric, 2))
  from jsonb_array_elements(coalesce(p_alocacoes, '[]'::jsonb)) as e(elem)
  where (e.elem->>'unidadeId') ~ '^[0-9a-f-]{36}$'
    and coalesce((e.elem->>'percentual')::numeric, 0) > 0
    and exists (select 1 from public.unidades u where u.id = (e.elem->>'unidadeId')::uuid);
end;
$$;
revoke execute on function public.definir_alocacoes(uuid, jsonb) from public, anon;
grant execute on function public.definir_alocacoes(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- importar_backup v3
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

  insert into public.documentos (nome, horas, periodicidade_meses, responsavel, created_at)
  select btrim(e.elem->>'nome'),
         greatest(0, coalesce(nullif(e.elem->>'horas', ''), '0')::numeric),
         greatest(0, round(coalesce(nullif(e.elem->>'periodicidadeMeses', ''), '0')::numeric))::int,
         case when e.elem->>'responsavel' = 'Administrativo' then 'Administrativo'
              else 'Técnico de Segurança do Trabalho' end,
         now() + (e.n * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p->'documentos', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> '';

  -- colaboradores (created_at escalonado serve de chave para reencontrar cada um abaixo)
  insert into public.colaboradores (nome, funcao, horas_mes, eficiencia, created_at)
  select btrim(e.elem->>'nome'),
         case when e.elem->>'funcao' = 'Administrativo' then 'Administrativo'
              else 'Técnico de Segurança do Trabalho' end,
         greatest(0, coalesce(nullif(e.elem->>'horasMes', ''), '160')::numeric),
         least(100, greatest(1, coalesce(nullif(e.elem->>'eficiencia', ''), '80')::numeric)),
         now() + (e.n * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p->'colaboradores', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> '';

  -- alocações: formato novo (alocacoes[{unidadeNome, percentual}]) ou legado (unidadeNome = 100%)
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
