-- ============================================================================
-- Chabra Dimensiona — 0016_documentos_vencidos
-- Lógica simplificada: por unidade e mês só existe UM número — quantas empresas
-- estão com documentos vencidos. Cada uma exige o atendimento completo
-- (inspeção, relatório e finalização). Saem as três situações e os pesos.
-- Dados: vencidas = vencendo + a vencer (as "em dia" não geravam trabalho).
-- ============================================================================

alter table public.unidades add column empresas_vencidas integer not null default 0 check (empresas_vencidas >= 0);
update public.unidades set empresas_vencidas = empresas_vencendo + empresas_a_vencer;
alter table public.unidades
  drop column empresas,          -- coluna gerada (soma das situações)
  drop column empresas_em_dia,
  drop column empresas_vencendo,
  drop column empresas_a_vencer;
comment on column public.unidades.empresas_vencidas is 'Padrão do ano: empresas com documentos vencidos (cada uma exige atendimento completo no mês).';

alter table public.unidade_empresas_mes add column empresas_vencidas integer not null default 0 check (empresas_vencidas >= 0);
update public.unidade_empresas_mes set empresas_vencidas = empresas_vencendo + empresas_a_vencer;
alter table public.unidade_empresas_mes
  drop column empresas_em_dia,
  drop column empresas_vencendo,
  drop column empresas_a_vencer;
comment on column public.unidade_empresas_mes.empresas_vencidas is 'Valor próprio do mês: empresas com documentos vencidos.';

alter table public.parametros
  drop column peso_em_dia,
  drop column peso_vencendo,
  drop column peso_a_vencer;

-- ---------------------------------------------------------------------------
-- importar_backup v12: só documentos vencidos (aceita as chaves antigas)
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

  -- empresas com documentos vencidos (backups antigos: vencendo + a vencer; grau baixo+médio+alto; ou só "empresas")
  insert into public.unidades (nome, empresas_vencidas, created_at)
  select btrim(e.elem->>'nome'),
         greatest(0, round(coalesce(
           nullif(e.elem->>'empresasVencidas', '')::numeric,
           case when e.elem ? 'empresasAVencer' or e.elem ? 'empresasVencendo'
                then coalesce(nullif(e.elem->>'empresasVencendo', '')::numeric, 0) + coalesce(nullif(e.elem->>'empresasAVencer', '')::numeric, 0) end,
           case when e.elem ? 'empresasBaixo' or e.elem ? 'empresasMedio' or e.elem ? 'empresasAlto'
                then coalesce(nullif(e.elem->>'empresasBaixo', '')::numeric, 0) + coalesce(nullif(e.elem->>'empresasMedio', '')::numeric, 0) + coalesce(nullif(e.elem->>'empresasAlto', '')::numeric, 0) end,
           nullif(e.elem->>'empresas', '')::numeric,
           0)))::int,
         now() + (e.n * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p->'unidades', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> '';

  insert into public.unidade_empresas_mes (unidade_id, mes, empresas_vencidas)
  select u.id,
         (m->>'mes')::int,
         greatest(0, round(coalesce(
           nullif(m->>'empresasVencidas', '')::numeric,
           case when m ? 'empresasAVencer' or m ? 'empresasVencendo'
                then coalesce(nullif(m->>'empresasVencendo', '')::numeric, 0) + coalesce(nullif(m->>'empresasAVencer', '')::numeric, 0) end,
           case when m ? 'empresasBaixo' or m ? 'empresasMedio' or m ? 'empresasAlto'
                then coalesce(nullif(m->>'empresasBaixo', '')::numeric, 0) + coalesce(nullif(m->>'empresasMedio', '')::numeric, 0) + coalesce(nullif(m->>'empresasAlto', '')::numeric, 0) end,
           0)))::int
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
      ocupacao_alvo = coalesce(nullif(par->>'ocupacaoAlvo', '')::numeric, ocupacao_alvo)
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
