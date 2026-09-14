-- ============================================================================
-- Chabra Dimensiona — 0010_historico
-- Histórico de alterações dos cadastros: quem mudou o quê e quando.
--   * tabela historico (somente leitura para a equipe; escrita só pelos gatilhos)
--   * gatilho registrar_historico() em unidades, unidade_empresas_mes,
--     colaboradores, colaborador_unidades, parametros e documentos
--   * importar_backup desliga os gatilhos e registra um único evento "importacao"
-- ============================================================================

create table public.historico (
  id            bigint generated always as identity primary key,
  quando        timestamptz not null default now(),
  usuario_id    uuid,
  usuario_nome  text,
  usuario_email text,
  tabela        text not null,
  operacao      text not null check (operacao in ('insert', 'update', 'delete', 'importacao')),
  registro_id   text,
  antes         jsonb,
  depois        jsonb
);
comment on table public.historico is 'Registro automático de alterações nos cadastros (gatilhos). Somente leitura para a equipe.';
create index historico_quando_idx on public.historico (quando desc);

alter table public.historico enable row level security;
create policy "equipe: ler historico" on public.historico for select to authenticated using (true);
revoke all on table public.historico from anon, public;
grant select on table public.historico to authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.historico from authenticated;

-- ---------------------------------------------------------------------------
-- quem está logado (nome e e-mail a partir do JWT)
-- ---------------------------------------------------------------------------
create or replace function public._usuario_atual()
returns table (id uuid, nome text, email text)
language plpgsql
stable
set search_path = ''
as $$
declare claims jsonb;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    claims := null;
  end;
  id := (select auth.uid());
  email := claims->>'email';
  nome := nullif(btrim(concat_ws(' ', claims->'user_metadata'->>'nome', claims->'user_metadata'->>'sobrenome')), '');
  return next;
end;
$$;
revoke execute on function public._usuario_atual() from public, anon;
grant execute on function public._usuario_atual() to authenticated;

-- ---------------------------------------------------------------------------
-- gatilho genérico
-- ---------------------------------------------------------------------------
create or replace function public.registrar_historico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  antes jsonb;
  depois jsonb;
begin
  -- importação em massa registra um evento só (ver importar_backup)
  if coalesce(current_setting('app.historico', true), '') = 'off' then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') then antes := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then depois := to_jsonb(new); end if;

  -- update sem mudança real (só updated_at) não vira histórico
  if tg_op = 'UPDATE' and (antes - 'updated_at') = (depois - 'updated_at') then
    return new;
  end if;

  -- nomes para exibição (ids não dizem nada para quem lê)
  if tg_table_name in ('colaborador_unidades', 'unidade_empresas_mes') then
    if antes  is not null then antes  := antes  || jsonb_build_object('unidade_nome', (select x.nome from public.unidades x where x.id = (antes->>'unidade_id')::uuid)); end if;
    if depois is not null then depois := depois || jsonb_build_object('unidade_nome', (select x.nome from public.unidades x where x.id = (depois->>'unidade_id')::uuid)); end if;
  end if;
  if tg_table_name = 'colaborador_unidades' then
    if antes  is not null then antes  := antes  || jsonb_build_object('colaborador_nome', (select x.nome from public.colaboradores x where x.id = (antes->>'colaborador_id')::uuid)); end if;
    if depois is not null then depois := depois || jsonb_build_object('colaborador_nome', (select x.nome from public.colaboradores x where x.id = (depois->>'colaborador_id')::uuid)); end if;
  end if;

  select * into u from public._usuario_atual();

  insert into public.historico (usuario_id, usuario_nome, usuario_email, tabela, operacao, registro_id, antes, depois)
  values (u.id, u.nome, u.email, tg_table_name, lower(tg_op), coalesce(depois->>'id', antes->>'id'), antes, depois);

  return coalesce(new, old);
end;
$$;
revoke execute on function public.registrar_historico() from public, anon, authenticated;

create trigger unidades_historico              after insert or update or delete on public.unidades              for each row execute function public.registrar_historico();
create trigger unidade_empresas_mes_historico  after insert or update or delete on public.unidade_empresas_mes  for each row execute function public.registrar_historico();
create trigger colaboradores_historico         after insert or update or delete on public.colaboradores         for each row execute function public.registrar_historico();
create trigger colaborador_unidades_historico  after insert or update or delete on public.colaborador_unidades  for each row execute function public.registrar_historico();
create trigger parametros_historico            after update on public.parametros                                for each row execute function public.registrar_historico();
create trigger documentos_historico            after insert or update or delete on public.documentos            for each row execute function public.registrar_historico();

-- ---------------------------------------------------------------------------
-- evento único de importação (chamado por importar_backup)
-- ---------------------------------------------------------------------------
create or replace function public._registrar_importacao(resumo jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare u record;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  select * into u from public._usuario_atual();
  insert into public.historico (usuario_id, usuario_nome, usuario_email, tabela, operacao, depois)
  values (u.id, u.nome, u.email, 'backup', 'importacao', resumo);
end;
$$;
revoke execute on function public._registrar_importacao(jsonb) from public, anon;
grant execute on function public._registrar_importacao(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- importar_backup v6: gatilhos desligados + evento único de importação
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

  -- gatilhos de histórico desligados durante a importação (um evento só no final)
  perform set_config('app.historico', 'off', true);

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

  -- colaboradores: produção diária (backups antigos, em horas, entram com o padrão 2/2/2)
  insert into public.colaboradores (nome, funcao, empresas_dia, inspecoes_dia, relatorios_dia, created_at)
  select btrim(e.elem->>'nome'),
         case when e.elem->>'funcao' = 'Administrativo' then 'Administrativo'
              else 'Técnico de Segurança do Trabalho' end,
         greatest(0, coalesce(nullif(e.elem->>'empresasDia',   '')::numeric, 2)),
         greatest(0, coalesce(nullif(e.elem->>'inspecoesDia',  '')::numeric, 2)),
         greatest(0, coalesce(nullif(e.elem->>'relatoriosDia', '')::numeric, 2)),
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
      dias_uteis    = coalesce((select array_agg(greatest(0, least(31, round(x::numeric)::int)) order by ord)
                                  from jsonb_array_elements_text(par->'diasUteis') with ordinality as t(x, ord)
                                 where jsonb_typeof(par->'diasUteis') = 'array' and jsonb_array_length(par->'diasUteis') = 12),
                               dias_uteis),
      fator_baixo   = coalesce(nullif(par->>'fatorBaixo', '')::numeric, fator_baixo),
      fator_medio   = coalesce(nullif(par->>'fatorMedio', '')::numeric, fator_medio),
      fator_alto    = coalesce(nullif(par->>'fatorAlto',  '')::numeric, fator_alto),
      ocupacao_alvo = coalesce(nullif(par->>'ocupacaoAlvo', '')::numeric, ocupacao_alvo),
      meses_por_inspecao    = coalesce(nullif(par->>'mesesPorInspecao',    '')::numeric, meses_por_inspecao),
      meses_por_relatorio   = coalesce(nullif(par->>'mesesPorRelatorio',   '')::numeric, meses_por_relatorio),
      meses_por_finalizacao = coalesce(nullif(par->>'mesesPorFinalizacao', '')::numeric, meses_por_finalizacao)
    where id = 1;
  end if;

  perform public._registrar_importacao(jsonb_build_object(
    'unidades', (select count(*) from public.unidades),
    'documentos', (select count(*) from public.documentos),
    'colaboradores', (select count(*) from public.colaboradores),
    'parametros', (par is not null)));
end;
$$;
