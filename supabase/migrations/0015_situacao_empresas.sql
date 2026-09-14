-- ============================================================================
-- Chabra Dimensiona — 0015_situacao_empresas
-- As empresas deixam de ser classificadas por grau de dificuldade e passam a
-- ser classificadas pela situação da documentação no mês:
--   em dia    → não gera trabalho (peso 0)
--   vencendo  → gera parte do trabalho (peso 0,5: inspeção/preparação)
--   a vencer  → vence no mês: atendimento completo (peso 1)
-- Colunas renomeadas (baixo → em_dia, médio → vencendo, alto → a_vencer);
-- os pesos ficam editáveis (>= 0). A "frequência de atendimento" sai do
-- modelo: a situação já diz quando a empresa precisa de atendimento.
-- ============================================================================

alter table public.unidades rename column empresas_baixo to empresas_em_dia;
alter table public.unidades rename column empresas_medio to empresas_vencendo;
alter table public.unidades rename column empresas_alto  to empresas_a_vencer;
alter table public.unidades rename constraint unidades_empresas_baixo_check to unidades_empresas_em_dia_check;
alter table public.unidades rename constraint unidades_empresas_medio_check to unidades_empresas_vencendo_check;
alter table public.unidades rename constraint unidades_empresas_alto_check  to unidades_empresas_a_vencer_check;
comment on column public.unidades.empresas_em_dia   is 'Padrão do ano: empresas com documentação em dia (não geram trabalho).';
comment on column public.unidades.empresas_vencendo is 'Padrão do ano: empresas com documentação vencendo em breve.';
comment on column public.unidades.empresas_a_vencer is 'Padrão do ano: empresas com documentação vencendo no mês (atendimento completo).';

alter table public.unidade_empresas_mes rename column empresas_baixo to empresas_em_dia;
alter table public.unidade_empresas_mes rename column empresas_medio to empresas_vencendo;
alter table public.unidade_empresas_mes rename column empresas_alto  to empresas_a_vencer;
alter table public.unidade_empresas_mes rename constraint unidade_empresas_mes_empresas_baixo_check to unidade_empresas_mes_empresas_em_dia_check;
alter table public.unidade_empresas_mes rename constraint unidade_empresas_mes_empresas_medio_check to unidade_empresas_mes_empresas_vencendo_check;
alter table public.unidade_empresas_mes rename constraint unidade_empresas_mes_empresas_alto_check  to unidade_empresas_mes_empresas_a_vencer_check;

alter table public.parametros rename column fator_baixo to peso_em_dia;
alter table public.parametros rename column fator_medio to peso_vencendo;
alter table public.parametros rename column fator_alto  to peso_a_vencer;
alter table public.parametros
  drop constraint parametros_fator_baixo_check,
  drop constraint parametros_fator_medio_check,
  drop constraint parametros_fator_alto_check,
  add constraint parametros_peso_em_dia_check   check (peso_em_dia >= 0),
  add constraint parametros_peso_vencendo_check check (peso_vencendo >= 0),
  add constraint parametros_peso_a_vencer_check check (peso_a_vencer >= 0),
  alter column peso_em_dia   set default 0,
  alter column peso_vencendo set default 0.5,
  alter column peso_a_vencer set default 1,
  drop column meses_por_inspecao,
  drop column meses_por_relatorio,
  drop column meses_por_finalizacao;
comment on column public.parametros.peso_em_dia   is 'Trabalho que uma empresa em dia gera no mês (0 = nenhum).';
comment on column public.parametros.peso_vencendo is 'Trabalho que uma empresa vencendo gera no mês (fração do atendimento completo).';
comment on column public.parametros.peso_a_vencer is 'Trabalho que uma empresa a vencer no mês gera (1 = atendimento completo).';
update public.parametros set peso_em_dia = 0, peso_vencendo = 0.5, peso_a_vencer = 1 where id = 1;

-- ---------------------------------------------------------------------------
-- importar_backup v11: situação das empresas (aceita chaves antigas) e pesos novos
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

  -- situação da empresa: em dia / vencendo / a vencer no mês (backups antigos: baixo/médio/alto ou só "empresas" → em dia)
  insert into public.unidades (nome, empresas_em_dia, empresas_vencendo, empresas_a_vencer, created_at)
  select btrim(e.elem->>'nome'),
         greatest(0, round(coalesce(nullif(e.elem->>'empresasEmDia', ''), nullif(e.elem->>'empresasBaixo', ''), nullif(e.elem->>'empresas', ''), '0')::numeric))::int,
         greatest(0, round(coalesce(nullif(e.elem->>'empresasVencendo', ''), nullif(e.elem->>'empresasMedio', ''), '0')::numeric))::int,
         greatest(0, round(coalesce(nullif(e.elem->>'empresasAVencer', ''), nullif(e.elem->>'empresasAlto', ''), '0')::numeric))::int,
         now() + (e.n * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p->'unidades', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> '';

  insert into public.unidade_empresas_mes (unidade_id, mes, empresas_em_dia, empresas_vencendo, empresas_a_vencer)
  select u.id,
         (m->>'mes')::int,
         greatest(0, round(coalesce(nullif(m->>'empresasEmDia', ''), nullif(m->>'empresasBaixo', ''), '0')::numeric))::int,
         greatest(0, round(coalesce(nullif(m->>'empresasVencendo', ''), nullif(m->>'empresasMedio', ''), '0')::numeric))::int,
         greatest(0, round(coalesce(nullif(m->>'empresasAVencer', ''), nullif(m->>'empresasAlto', ''), '0')::numeric))::int
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
      -- pesos antigos (fatorBaixo/Medio/Alto, de grau de dificuldade) não são aproveitados: o sentido mudou
      peso_em_dia   = coalesce(nullif(par->>'pesoEmDia',   '')::numeric, peso_em_dia),
      peso_vencendo = coalesce(nullif(par->>'pesoVencendo', '')::numeric, peso_vencendo),
      peso_a_vencer = coalesce(nullif(par->>'pesoAVencer',  '')::numeric, peso_a_vencer),
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
