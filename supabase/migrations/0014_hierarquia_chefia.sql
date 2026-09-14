-- ============================================================================
-- Chabra Dimensiona — 0014_hierarquia_chefia
-- Uma chefia diz quem coordena (toda a equipe / só técnicos / só administrativos)
-- e para qual função responde (hierarquia entre chefias, opcional).
--   Gerente                 → coordena todos (supervisores e equipes), topo
--   Supervisor Geral        → coordena todos, responde ao Gerente
--   Supervisor TST Externo  → coordena técnicos, responde ao Gerente
--   Supervisor ADM          → coordena administrativos, responde ao Supervisor Geral
-- ============================================================================

alter table public.funcoes
  add column coordena      text not null default 'todos' check (coordena in ('todos', 'tecnicos', 'administrativos')),
  add column responde_para uuid references public.funcoes(id) on delete set null,
  add constraint funcoes_responde_para_diferente check (responde_para is null or responde_para <> id);
comment on column public.funcoes.coordena is 'Quem a chefia coordena nas unidades em que está: todos, só técnicos ou só administrativos.';
comment on column public.funcoes.responde_para is 'Função de chefia a quem esta função responde (null = topo).';
create index funcoes_responde_para_idx on public.funcoes (responde_para);

-- Gerente entra antes dos supervisores na ordem
update public.funcoes set ordem = ordem + 1 where ordem >= 3;
insert into public.funcoes (nome, tipo_producao, chefia, coordena, ordem) values ('Gerente', 'nenhuma', true, 'todos', 3)
  on conflict ((lower(btrim(nome)))) do update set chefia = true, coordena = 'todos';
update public.funcoes set responde_para = (select id from public.funcoes where lower(nome) = 'gerente' limit 1) where lower(nome) in ('supervisor geral', 'supervisor tst externo');
update public.funcoes set coordena = 'tecnicos' where lower(nome) = 'supervisor tst externo';
update public.funcoes set coordena = 'administrativos', responde_para = (select id from public.funcoes where lower(nome) = 'supervisor geral' limit 1) where lower(nome) = 'supervisor adm';

-- ---------------------------------------------------------------------------
-- importar_backup v10: funções com coordena e respondePara (nome)
-- ---------------------------------------------------------------------------
create or replace function public.importar_backup(p jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  par jsonb := p->'parametros';
  funcao_padrao uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Backup inválido' using errcode = '22023';
  end if;

  perform set_config('app.historico', 'off', true);

  delete from public.colaboradores;
  delete from public.documentos;
  delete from public.unidades;

  -- funções do backup: cria as que faltam, atualiza o tipo das existentes (nunca apaga)
  insert into public.funcoes (nome, tipo_producao, chefia, coordena, ordem)
  select btrim(e.elem->>'nome'),
         case when e.elem->>'tipoProducao' in ('tecnico', 'administrativo', 'nenhuma') then e.elem->>'tipoProducao' else 'nenhuma' end,
         coalesce((e.elem->>'chefia')::boolean, false),
         case when e.elem->>'coordena' in ('todos', 'tecnicos', 'administrativos') then e.elem->>'coordena' else 'todos' end,
         coalesce(nullif(e.elem->>'ordem', '')::int, 100 + e.n::int)
  from jsonb_array_elements(coalesce(p->'funcoes', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> ''
  on conflict ((lower(btrim(nome)))) do update set tipo_producao = excluded.tipo_producao, chefia = excluded.chefia, coordena = excluded.coordena, ordem = excluded.ordem;

  -- "responde para" pelo nome da função (segunda passada, depois de todas existirem)
  update public.funcoes f
     set responde_para = s.id
    from jsonb_array_elements(coalesce(p->'funcoes', '[]'::jsonb)) as e(elem)
    left join public.funcoes s on lower(btrim(s.nome)) = lower(btrim(coalesce(e.elem->>'respondePara', '')))
   where lower(btrim(f.nome)) = lower(btrim(coalesce(e.elem->>'nome', '')))
     and (s.id is null or s.id <> f.id);

  select id into funcao_padrao from public.funcoes where tipo_producao = 'tecnico' order by ordem limit 1;
  if funcao_padrao is null then
    insert into public.funcoes (nome, tipo_producao, ordem) values ('Técnico de Segurança do Trabalho', 'tecnico', 1) returning id into funcao_padrao;
  end if;

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

  -- colaboradores: função pelo nome (desconhecida → função técnica padrão)
  insert into public.colaboradores (nome, funcao_id, empresas_dia, inspecoes_dia, relatorios_dia, created_at)
  select btrim(e.elem->>'nome'),
         coalesce((select f.id from public.funcoes f where lower(btrim(f.nome)) = lower(btrim(coalesce(e.elem->>'funcao', ''))) limit 1), funcao_padrao),
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

  perform interno.registrar_importacao(jsonb_build_object(
    'unidades', (select count(*) from public.unidades),
    'documentos', (select count(*) from public.documentos),
    'colaboradores', (select count(*) from public.colaboradores),
    'funcoes', (select count(*) from public.funcoes),
    'parametros', (par is not null)));
end;
$$;
