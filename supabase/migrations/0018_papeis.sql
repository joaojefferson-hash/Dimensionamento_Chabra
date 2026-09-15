-- ============================================================================
-- Chabra Dimensiona — 0018_papeis
-- Papéis de acesso (definidos pelo administrador; ficam em app_metadata.papel,
-- que o próprio usuário não consegue editar):
--   admin       → vê e edita tudo; gerencia usuários; importa backup
--   supervisor  → vê e edita os cadastros (unidades, empresas, colaboradores,
--                 funções, calendário); não vê o dimensionamento
--   leitura     → vê tudo (diretoria, gerência, RH); não altera nada
-- Sem papel: quem tem app_metadata.admin = true é admin; os demais são leitura.
-- Escrita nas tabelas passa a exigir admin ou supervisor (RLS).
-- ============================================================================

create or replace function public.papel_atual()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(auth.jwt() -> 'app_metadata' ->> 'papel', '') in ('admin', 'supervisor', 'leitura')
      then auth.jwt() -> 'app_metadata' ->> 'papel'
    when coalesce(auth.jwt() -> 'app_metadata' ->> 'admin', 'false') = 'true'
      then 'admin'
    else 'leitura'
  end
$$;
comment on function public.papel_atual() is 'Papel do usuário logado: admin, supervisor ou leitura (de app_metadata no JWT).';

create or replace function public.pode_editar()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.papel_atual() in ('admin', 'supervisor')
$$;
comment on function public.pode_editar() is 'Admin e supervisor podem alterar os cadastros; leitura só consulta.';

revoke all on function public.papel_atual() from anon, public;
revoke all on function public.pode_editar() from anon, public;
grant execute on function public.papel_atual() to authenticated;
grant execute on function public.pode_editar() to authenticated;

-- escrita só para quem pode editar (leitura continua vendo tudo)
alter policy "equipe: inserir unidades"      on public.unidades              with check ((select public.pode_editar()));
alter policy "equipe: atualizar unidades"    on public.unidades              using ((select public.pode_editar())) with check ((select public.pode_editar()));
alter policy "equipe: excluir unidades"      on public.unidades              using ((select public.pode_editar()));
alter policy "equipe: inserir empresas_mes"  on public.unidade_empresas_mes  with check ((select public.pode_editar()));
alter policy "equipe: atualizar empresas_mes" on public.unidade_empresas_mes using ((select public.pode_editar())) with check ((select public.pode_editar()));
alter policy "equipe: excluir empresas_mes"  on public.unidade_empresas_mes  using ((select public.pode_editar()));
alter policy "equipe: inserir colaboradores"   on public.colaboradores       with check ((select public.pode_editar()));
alter policy "equipe: atualizar colaboradores" on public.colaboradores       using ((select public.pode_editar())) with check ((select public.pode_editar()));
alter policy "equipe: excluir colaboradores"   on public.colaboradores       using ((select public.pode_editar()));
alter policy "equipe: inserir alocacoes"    on public.colaborador_unidades  with check ((select public.pode_editar()));
alter policy "equipe: atualizar alocacoes"  on public.colaborador_unidades  using ((select public.pode_editar())) with check ((select public.pode_editar()));
alter policy "equipe: excluir alocacoes"    on public.colaborador_unidades  using ((select public.pode_editar()));
alter policy "equipe: inserir funcoes"      on public.funcoes               with check ((select public.pode_editar()));
alter policy "equipe: atualizar funcoes"    on public.funcoes               using ((select public.pode_editar())) with check ((select public.pode_editar()));
alter policy "equipe: excluir funcoes"      on public.funcoes               using ((select public.pode_editar()));
alter policy "equipe: inserir documentos"   on public.documentos            with check ((select public.pode_editar()));
alter policy "equipe: atualizar documentos" on public.documentos            using ((select public.pode_editar())) with check ((select public.pode_editar()));
alter policy "equipe: excluir documentos"   on public.documentos            using ((select public.pode_editar()));
alter policy "equipe: atualizar parametros" on public.parametros            using ((select public.pode_editar())) with check ((select public.pode_editar()));

-- ---------------------------------------------------------------------------
-- importar_backup v13: só administrador (substitui todos os dados)
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
