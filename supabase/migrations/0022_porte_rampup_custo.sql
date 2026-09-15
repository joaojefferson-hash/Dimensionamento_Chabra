-- 0022 — Porte do cliente (P/M/G), ramp-up de contratações, custo por função, demanda normalizada.
--
-- • portes: peso que multiplica o esforço de cada empresa (P 1,0 · M 1,5 · G 2,0), editável.
-- • demanda_mensal: quantos clientes VENCEM no mês, por unidade × condição × porte
--   (substitui as colunas empresas_vencidas / empresas_exclusiva_tst de unidade_empresas_mes).
-- • unidade_mes: clientes ativos (informativo) por unidade × mês.
-- • funcoes.custo_mensal; colaboradores.data_admissao / data_desligamento / custo_mensal;
--   parametros.rampup (% de produção no 1º, 2º… mês de casa; depois 100).
-- • importar_backup v17: formato v12 (demandaPorMes, clientesAtivosPorMes, portes) e os antigos (porte P).
-- Os dados atuais são copiados como porte P (peso 1,0): nada muda nos números.
-- A tabela unidade_empresas_mes e as colunas "padrão" de unidades ficam até a 0023 (depois do front no ar).

-- ---------- portes ----------
create table public.portes (
  codigo  text primary key check (btrim(codigo) <> ''),
  nome    text not null check (btrim(nome) <> ''),
  peso    numeric(4,2) not null check (peso > 0),
  ordem   smallint not null default 0
);
comment on table public.portes is 'Porte/complexidade do cliente. peso multiplica o esforço de cada empresa (inspeção, relatório, finalização).';
insert into public.portes (codigo, nome, peso, ordem) values ('P', 'Pequeno', 1.00, 1), ('M', 'Médio', 1.50, 2), ('G', 'Grande', 2.00, 3);

-- ---------- demanda por condição × porte ----------
create table public.demanda_mensal (
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  ano         smallint not null check (ano between 2000 and 2100),
  mes         smallint not null check (mes between 1 and 12),
  condicao    text not null check (condicao in ('mensal', 'exclusiva_tst')),
  porte       text not null references public.portes(codigo),
  quantidade  integer not null default 0 check (quantidade >= 0),
  updated_at  timestamptz not null default now(),
  primary key (unidade_id, ano, mes, condicao, porte)
);
comment on table public.demanda_mensal is 'Quantos clientes VENCEM no mês, por unidade, condição e porte. Só o que vence naquele mês (nos passados, o que venceu e ainda está em aberto); o acumulado é calculado pelo motor.';
create index demanda_mensal_ano_mes on public.demanda_mensal (ano, mes);

create table public.unidade_mes (
  unidade_id       uuid not null references public.unidades(id) on delete cascade,
  ano              smallint not null check (ano between 2000 and 2100),
  mes              smallint not null check (mes between 1 and 12),
  clientes_ativos  integer not null default 0 check (clientes_ativos >= 0),
  updated_at       timestamptz not null default now(),
  primary key (unidade_id, ano, mes)
);
comment on table public.unidade_mes is 'Números só informativos por unidade × mês (clientes ativos). Não entram em nenhuma conta.';

-- ---------- custo, admissão, ramp-up ----------
alter table public.funcoes add column custo_mensal numeric(12,2) not null default 0 check (custo_mensal >= 0);
comment on column public.funcoes.custo_mensal is 'Custo médio mensal de uma pessoa nesta função (salário + encargos). Base do impacto financeiro.';

alter table public.colaboradores
  add column data_admissao date,
  add column data_desligamento date,
  add column custo_mensal numeric(12,2) check (custo_mensal >= 0),
  add constraint colaboradores_datas check (data_desligamento is null or data_admissao is null or data_desligamento >= data_admissao);
comment on column public.colaboradores.data_admissao is 'Ramp-up: mês de casa 1 = rampup[1]%, mês 2 = rampup[2]%, depois 100%. Sem data = 100% desde sempre.';
comment on column public.colaboradores.data_desligamento is 'Sai da equipe a partir desta data (o mês conta proporcional aos dias).';
comment on column public.colaboradores.custo_mensal is 'Opcional: sobrepõe o custo médio da função.';

alter table public.parametros
  add column rampup integer[] not null default '{50,80}'
  check (array_length(rampup, 1) is null or (array_length(rampup, 1) <= 12 and 0 <= all(rampup) and 100 >= all(rampup)));
comment on column public.parametros.rampup is '% de produção de quem foi contratado: 1º mês, 2º mês… (depois 100). Padrão {50,80}.';

-- ---------- cópia dos dados atuais (porte P = peso 1,0) ----------
insert into public.demanda_mensal (unidade_id, ano, mes, condicao, porte, quantidade)
  select unidade_id, ano, mes, 'mensal', 'P', empresas_vencidas from public.unidade_empresas_mes where empresas_vencidas > 0
  union all
  select unidade_id, ano, mes, 'exclusiva_tst', 'P', empresas_exclusiva_tst from public.unidade_empresas_mes where empresas_exclusiva_tst > 0;
insert into public.unidade_mes (unidade_id, ano, mes, clientes_ativos)
  select unidade_id, ano, mes, clientes_ativos from public.unidade_empresas_mes where clientes_ativos > 0;

-- ---------- RLS (mesmo padrão das outras tabelas) ----------
alter table public.portes enable row level security;
alter table public.demanda_mensal enable row level security;
alter table public.unidade_mes enable row level security;
create policy "equipe: ler portes"       on public.portes for select to authenticated using (true);
create policy "equipe: atualizar portes" on public.portes for update to authenticated using ((select public.pode_editar())) with check ((select public.pode_editar()));
create policy "equipe: inserir portes"   on public.portes for insert to authenticated with check ((select public.pode_editar()));
create policy "equipe: excluir portes"   on public.portes for delete to authenticated using ((select public.pode_editar()));
create policy "equipe: ler demanda"       on public.demanda_mensal for select to authenticated using (true);
create policy "equipe: inserir demanda"   on public.demanda_mensal for insert to authenticated with check ((select public.pode_editar()));
create policy "equipe: atualizar demanda" on public.demanda_mensal for update to authenticated using ((select public.pode_editar())) with check ((select public.pode_editar()));
create policy "equipe: excluir demanda"   on public.demanda_mensal for delete to authenticated using ((select public.pode_editar()));
create policy "equipe: ler unidade_mes"       on public.unidade_mes for select to authenticated using (true);
create policy "equipe: inserir unidade_mes"   on public.unidade_mes for insert to authenticated with check ((select public.pode_editar()));
create policy "equipe: atualizar unidade_mes" on public.unidade_mes for update to authenticated using ((select public.pode_editar())) with check ((select public.pode_editar()));
create policy "equipe: excluir unidade_mes"   on public.unidade_mes for delete to authenticated using ((select public.pode_editar()));

-- ---------- histórico: nome da unidade nas novas tabelas; registro_id para chaves compostas ----------
create or replace function public.registrar_historico() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  u record;
  antes jsonb;
  depois jsonb;
  rid text;
begin
  if coalesce(current_setting('app.historico', true), '') = 'off' then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') then antes := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then depois := to_jsonb(new); end if;

  if tg_op = 'UPDATE' and (antes - 'updated_at') = (depois - 'updated_at') then
    return new;
  end if;

  if tg_table_name in ('colaborador_unidades', 'unidade_empresas_mes', 'demanda_mensal', 'unidade_mes') then
    if antes  is not null then antes  := antes  || jsonb_build_object('unidade_nome', (select x.nome from public.unidades x where x.id = (antes->>'unidade_id')::uuid)); end if;
    if depois is not null then depois := depois || jsonb_build_object('unidade_nome', (select x.nome from public.unidades x where x.id = (depois->>'unidade_id')::uuid)); end if;
  end if;
  if tg_table_name = 'colaborador_unidades' then
    if antes  is not null then antes  := antes  || jsonb_build_object('colaborador_nome', (select x.nome from public.colaboradores x where x.id = (antes->>'colaborador_id')::uuid)); end if;
    if depois is not null then depois := depois || jsonb_build_object('colaborador_nome', (select x.nome from public.colaboradores x where x.id = (depois->>'colaborador_id')::uuid)); end if;
  end if;

  select * into u from public._usuario_atual();

  rid := coalesce(depois->>'id', antes->>'id', depois->>'codigo', antes->>'codigo',
                  concat_ws('/', coalesce(depois, antes)->>'unidade_id', coalesce(depois, antes)->>'colaborador_id',
                                 coalesce(depois, antes)->>'ano', coalesce(depois, antes)->>'mes',
                                 coalesce(depois, antes)->>'condicao', coalesce(depois, antes)->>'porte'));

  insert into public.historico (usuario_id, usuario_nome, usuario_email, tabela, operacao, registro_id, antes, depois)
  values (u.id, u.nome, u.email, tg_table_name, lower(tg_op), rid, antes, depois);

  return coalesce(new, old);
end;
$$;
create trigger portes_historico         after insert or update or delete on public.portes         for each row execute function public.registrar_historico();
create trigger demanda_mensal_historico after insert or update or delete on public.demanda_mensal for each row execute function public.registrar_historico();
create trigger unidade_mes_historico    after insert or update or delete on public.unidade_mes    for each row execute function public.registrar_historico();

-- ---------- importar_backup v17 ----------
create or replace function public.importar_backup(p jsonb) returns void
language plpgsql set search_path = '' as $$
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
  delete from public.unidades;   -- cascata: demanda_mensal, unidade_mes, unidade_empresas_mes

  -- portes do backup: cria/atualiza pesos (nunca apaga; P/M/G sempre existem)
  insert into public.portes (codigo, nome, peso, ordem)
  select btrim(e.elem->>'codigo'), coalesce(nullif(btrim(e.elem->>'nome'), ''), btrim(e.elem->>'codigo')),
         greatest(0.01, coalesce(nullif(e.elem->>'peso', '')::numeric, 1)), coalesce(nullif(e.elem->>'ordem', '')::int, e.n::int)
  from jsonb_array_elements(case when jsonb_typeof(p->'portes') = 'array' then p->'portes' else '[]'::jsonb end) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'codigo', '')) <> ''
  on conflict (codigo) do update set nome = excluded.nome, peso = excluded.peso, ordem = excluded.ordem;

  -- funções do backup: cria as que faltam, atualiza as existentes (nunca apaga)
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
         case when m->>'condicao' = 'exclusiva_tst' then 'exclusiva_tst' else 'mensal' end,
         case when exists (select 1 from public.portes pt where pt.codigo = m->>'porte') then m->>'porte' else 'P' end,
         greatest(0, round(coalesce(nullif(m->>'quantidade', '')::numeric, 0)))::int
  from jsonb_array_elements(coalesce(p->'unidades', '[]'::jsonb)) with ordinality as e(elem, n)
  join public.unidades u on u.created_at = now() + (e.n * interval '1 millisecond')
  cross join lateral jsonb_array_elements(case when jsonb_typeof(e.elem->'demandaPorMes') = 'array' then e.elem->'demandaPorMes' else '[]'::jsonb end) as m
  where (m->>'mes') ~ '^\d{1,2}$' and (m->>'mes')::int between 1 and 12
    and coalesce(nullif(m->>'ano', '')::int, extract(year from now())::int) between 2000 and 2100
    and greatest(0, round(coalesce(nullif(m->>'quantidade', '')::numeric, 0)))::int > 0
  on conflict (unidade_id, ano, mes, condicao, porte) do update set quantidade = excluded.quantidade;

  -- demanda no formato antigo (≤ v11): empresasPorMes = [{ ano, mes, empresasVencidas, empresasExclusivaTst, clientesAtivos }] → porte P
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

  -- clientes ativos (v12: clientesAtivosPorMes; antigo: dentro de empresasPorMes)
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

  -- colaboradores: função pelo nome (desconhecida → função técnica padrão); datas e custo opcionais
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
$$;
