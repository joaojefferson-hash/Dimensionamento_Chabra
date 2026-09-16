-- 0027 — Duas novas condições de atendimento em demanda_mensal, além de Mensal e
-- Exclusiva TST: 'sem_avaliacao' (Empresa sem avaliação) e 'contrato_novo' (Contratos novos).
-- Contam na demanda do mês como as demais, ponderadas apenas pelo porte.
--   * check da coluna condicao
--   * substituir_demanda_ano: aceita as quatro condições (fixa ou pela linha)
--   * importar_backup v18: idem no formato v12 (demandaPorMes)

alter table public.demanda_mensal drop constraint if exists demanda_mensal_condicao_check;
alter table public.demanda_mensal add constraint demanda_mensal_condicao_check
  check (condicao in ('mensal', 'exclusiva_tst', 'sem_avaliacao', 'contrato_novo'));

/* ---------- importação da planilha ---------- */

create or replace function public.substituir_demanda_ano(p_ano integer, p_linhas jsonb, p_condicao text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  apagadas integer;
  inseridas integer;
  cond text;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  if not public.pode_editar() then
    raise exception 'Sem permissão para alterar os cadastros.' using errcode = '42501';
  end if;
  if p_ano is null or p_ano < 2000 or p_ano > 2100 or p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'Dados inválidos' using errcode = '22023';
  end if;
  cond := nullif(trim(coalesce(p_condicao, '')), '');
  if cond is not null and cond not in ('mensal', 'exclusiva_tst', 'sem_avaliacao', 'contrato_novo') then
    raise exception 'Condição inválida' using errcode = '22023';
  end if;

  with ids as (select distinct (e->>'unidade_id')::uuid as unidade_id from jsonb_array_elements(p_linhas) e where (e->>'unidade_id') ~ '^[0-9a-f-]{36}$')
  delete from public.demanda_mensal d using ids
   where d.unidade_id = ids.unidade_id and d.ano = p_ano
     and (cond is null or d.condicao = cond);
  get diagnostics apagadas = row_count;

  insert into public.demanda_mensal (unidade_id, ano, mes, condicao, porte, quantidade)
  select (e->>'unidade_id')::uuid, p_ano, (e->>'mes')::int,
         coalesce(cond, case when e->>'condicao' in ('exclusiva_tst', 'sem_avaliacao', 'contrato_novo') then e->>'condicao' else 'mensal' end),
         case when exists (select 1 from public.portes p where p.codigo = e->>'porte') then e->>'porte' else 'P' end,
         greatest(0, round(coalesce(nullif(e->>'quantidade', '')::numeric, 0)))::int
  from jsonb_array_elements(p_linhas) e
  where (e->>'unidade_id') ~ '^[0-9a-f-]{36}$'
    and (e->>'mes') ~ '^\d{1,2}$' and (e->>'mes')::int between 1 and 12
    and greatest(0, round(coalesce(nullif(e->>'quantidade', '')::numeric, 0)))::int > 0
    and exists (select 1 from public.unidades u where u.id = (e->>'unidade_id')::uuid)
  on conflict (unidade_id, ano, mes, condicao, porte) do update set quantidade = excluded.quantidade;
  get diagnostics inseridas = row_count;

  return jsonb_build_object('apagadas', apagadas, 'inseridas', inseridas, 'condicao', cond);
end;
$$;

/* ---------- backup ---------- */

create or replace function public.importar_backup(p jsonb)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  par jsonb := p->'parametros';
  funcao_padrao uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  if public.papel_atual() <> 'admin' then
    raise exception 'Só administradores podem importar um backup (substitui todos os dados).' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Backup inválido' using errcode = '22023';
  end if;

  perform set_config('app.historico', 'off', true);

  delete from public.colaboradores;
  delete from public.documentos;
  delete from public.unidades;

  insert into public.portes (codigo, nome, peso, ordem)
  select btrim(e.elem->>'codigo'), coalesce(nullif(btrim(e.elem->>'nome'), ''), btrim(e.elem->>'codigo')),
         greatest(0.01, coalesce(nullif(e.elem->>'peso', '')::numeric, 1)), coalesce(nullif(e.elem->>'ordem', '')::int, e.n::int)
  from jsonb_array_elements(case when jsonb_typeof(p->'portes') = 'array' then p->'portes' else '[]'::jsonb end) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'codigo', '')) <> ''
  on conflict (codigo) do update set nome = excluded.nome, peso = excluded.peso, ordem = excluded.ordem;

  insert into public.funcoes (nome, tipo_producao, chefia, coordena, ordem, custo_mensal)
  select btrim(e.elem->>'nome'),
         case when e.elem->>'tipoProducao' in ('tecnico', 'administrativo', 'nenhuma') then e.elem->>'tipoProducao' else 'nenhuma' end,
         coalesce((e.elem->>'chefia')::boolean, false),
         case when e.elem->>'coordena' in ('todos', 'tecnicos', 'administrativos') then e.elem->>'coordena' else 'todos' end,
         coalesce(nullif(e.elem->>'ordem', '')::int, 100 + e.n::int),
         greatest(0, coalesce(nullif(e.elem->>'custoMensal', '')::numeric, 0))
  from jsonb_array_elements(coalesce(p->'funcoes', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> ''
  on conflict ((lower(btrim(nome)))) do update set tipo_producao = excluded.tipo_producao, chefia = excluded.chefia, coordena = excluded.coordena, ordem = excluded.ordem, custo_mensal = excluded.custo_mensal;

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

  insert into public.unidades (nome, created_at)
  select btrim(e.elem->>'nome'), now() + (e.n * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p->'unidades', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> '';

  -- demanda no formato novo (v12): demandaPorMes = [{ ano, mes, condicao, porte, quantidade }]
  insert into public.demanda_mensal (unidade_id, ano, mes, condicao, porte, quantidade)
  select u.id,
         coalesce(nullif(m->>'ano', '')::int, extract(year from now())::int),
         (m->>'mes')::int,
         case when m->>'condicao' in ('exclusiva_tst', 'sem_avaliacao', 'contrato_novo') then m->>'condicao' else 'mensal' end,
         case when exists (select 1 from public.portes pt where pt.codigo = m->>'porte') then m->>'porte' else 'P' end,
         greatest(0, round(coalesce(nullif(m->>'quantidade', '')::numeric, 0)))::int
  from jsonb_array_elements(coalesce(p->'unidades', '[]'::jsonb)) with ordinality as e(elem, n)
  join public.unidades u on u.created_at = now() + (e.n * interval '1 millisecond')
  cross join lateral jsonb_array_elements(case when jsonb_typeof(e.elem->'demandaPorMes') = 'array' then e.elem->'demandaPorMes' else '[]'::jsonb end) as m
  where (m->>'mes') ~ '^\d{1,2}$' and (m->>'mes')::int between 1 and 12
    and coalesce(nullif(m->>'ano', '')::int, extract(year from now())::int) between 2000 and 2100
    and greatest(0, round(coalesce(nullif(m->>'quantidade', '')::numeric, 0)))::int > 0
  on conflict (unidade_id, ano, mes, condicao, porte) do update set quantidade = excluded.quantidade;

  -- demanda no formato antigo (<= v11): empresasPorMes = [{ ano, mes, empresasVencidas, empresasExclusivaTst, clientesAtivos }] -> porte P
  insert into public.demanda_mensal (unidade_id, ano, mes, condicao, porte, quantidade)
  select u.id, x.ano, x.mes, x.condicao, 'P', x.qtd
  from jsonb_array_elements(coalesce(p->'unidades', '[]'::jsonb)) with ordinality as e(elem, n)
  join public.unidades u on u.created_at = now() + (e.n * interval '1 millisecond')
  cross join lateral jsonb_array_elements(case when jsonb_typeof(e.elem->'empresasPorMes') = 'array' then e.elem->'empresasPorMes' else '[]'::jsonb end) as m
  cross join lateral (
    select coalesce(nullif(m->>'ano', '')::int, extract(year from now())::int) as ano, (m->>'mes')::int as mes, 'mensal' as condicao,
           greatest(0, round(coalesce(
             nullif(m->>'empresasVencidas', '')::numeric,
             case when m ? 'empresasAVencer' or m ? 'empresasVencendo'
                  then coalesce(nullif(m->>'empresasVencendo', '')::numeric, 0) + coalesce(nullif(m->>'empresasAVencer', '')::numeric, 0) end,
             case when m ? 'empresasBaixo' or m ? 'empresasMedio' or m ? 'empresasAlto'
                  then coalesce(nullif(m->>'empresasBaixo', '')::numeric, 0) + coalesce(nullif(m->>'empresasMedio', '')::numeric, 0) + coalesce(nullif(m->>'empresasAlto', '')::numeric, 0) end,
             0)))::int as qtd
    union all
    select coalesce(nullif(m->>'ano', '')::int, extract(year from now())::int), (m->>'mes')::int, 'exclusiva_tst',
           greatest(0, round(coalesce(nullif(m->>'empresasExclusivaTst', '')::numeric, 0)))::int
  ) as x
  where (m->>'mes') ~ '^\d{1,2}$' and (m->>'mes')::int between 1 and 12 and x.ano between 2000 and 2100 and x.qtd > 0
  on conflict (unidade_id, ano, mes, condicao, porte) do nothing;

  insert into public.unidade_mes (unidade_id, ano, mes, clientes_ativos)
  select u.id,
         coalesce(nullif(m->>'ano', '')::int, extract(year from now())::int),
         (m->>'mes')::int,
         greatest(0, round(coalesce(nullif(m->>'clientesAtivos', '')::numeric, 0)))::int
  from jsonb_array_elements(coalesce(p->'unidades', '[]'::jsonb)) with ordinality as e(elem, n)
  join public.unidades u on u.created_at = now() + (e.n * interval '1 millisecond')
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(e.elem->'clientesAtivosPorMes') = 'array' then e.elem->'clientesAtivosPorMes'
         when jsonb_typeof(e.elem->'empresasPorMes') = 'array' then e.elem->'empresasPorMes'
         else '[]'::jsonb end) as m
  where (m->>'mes') ~ '^\d{1,2}$' and (m->>'mes')::int between 1 and 12
    and coalesce(nullif(m->>'ano', '')::int, extract(year from now())::int) between 2000 and 2100
    and greatest(0, round(coalesce(nullif(m->>'clientesAtivos', '')::numeric, 0)))::int > 0
  on conflict (unidade_id, ano, mes) do update set clientes_ativos = excluded.clientes_ativos;

  insert into public.documentos (nome, horas, periodicidade_meses, responsavel, created_at)
  select btrim(e.elem->>'nome'),
         greatest(0, coalesce(nullif(e.elem->>'horas', ''), '0')::numeric),
         greatest(0, round(coalesce(nullif(e.elem->>'periodicidadeMeses', ''), '0')::numeric))::int,
         case when e.elem->>'responsavel' = 'Administrativo' then 'Administrativo' else 'Técnico de Segurança do Trabalho' end,
         now() + (e.n * interval '1 millisecond')
  from jsonb_array_elements(coalesce(p->'documentos', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> '';

  insert into public.colaboradores (nome, funcao_id, empresas_dia, inspecoes_dia, relatorios_dia, data_admissao, data_desligamento, custo_mensal, created_at)
  select btrim(e.elem->>'nome'),
         coalesce((select f.id from public.funcoes f where lower(btrim(f.nome)) = lower(btrim(coalesce(e.elem->>'funcao', ''))) limit 1), funcao_padrao),
         greatest(0, coalesce(nullif(e.elem->>'empresasDia',   '')::numeric, 2)),
         greatest(0, coalesce(nullif(e.elem->>'inspecoesDia',  '')::numeric, 2)),
         greatest(0, coalesce(nullif(e.elem->>'relatoriosDia', '')::numeric, 2)),
         case when (e.elem->>'dataAdmissao') ~ '^\d{4}-\d{2}-\d{2}' then (e.elem->>'dataAdmissao')::date end,
         case when (e.elem->>'dataDesligamento') ~ '^\d{4}-\d{2}-\d{2}' then (e.elem->>'dataDesligamento')::date end,
         nullif(greatest(0, coalesce(nullif(e.elem->>'custoMensal', '')::numeric, 0)), 0),
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
      ocupacao_alvo = coalesce(nullif(par->>'ocupacaoAlvo', '')::numeric, ocupacao_alvo),
      prazo_dias    = coalesce(least(365, greatest(1, nullif(par->>'prazoDias', '')::int)), prazo_dias),
      rampup        = coalesce((select array_agg(greatest(0, least(100, round(x::numeric)::int)) order by ord)
                                  from jsonb_array_elements_text(par->'rampup') with ordinality as t(x, ord)
                                 where jsonb_typeof(par->'rampup') = 'array' and jsonb_array_length(par->'rampup') <= 12),
                               case when jsonb_typeof(par->'rampup') = 'array' and jsonb_array_length(par->'rampup') = 0 then '{}'::int[] else rampup end)
    where id = 1;
  end if;

  perform interno.registrar_importacao(jsonb_build_object(
    'unidades', (select count(*) from public.unidades),
    'documentos', (select count(*) from public.documentos),
    'colaboradores', (select count(*) from public.colaboradores),
    'funcoes', (select count(*) from public.funcoes),
    'parametros', (par is not null)));
end;
$function$;
