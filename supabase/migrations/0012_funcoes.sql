-- ============================================================================
-- Chabra Dimensiona — 0012_funcoes
-- Funções viram cadastro próprio, com tipo de produção:
--   tecnico        → inspeções e relatórios por dia (entra na programação como técnico)
--   administrativo → empresas finalizadas por dia (entra como administrativo)
--   nenhuma        → sem ritmo; não entra na programação (ex.: supervisores)
-- colaboradores.funcao (texto) → colaboradores.funcao_id (FK)
-- ============================================================================

create table public.funcoes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (btrim(nome) <> ''),
  tipo_producao text not null default 'nenhuma' check (tipo_producao in ('tecnico', 'administrativo', 'nenhuma')),
  ordem         integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.funcoes is 'Funções da equipe. tipo_producao define o que a pessoa entrega (ou nenhuma = não entra na programação).';
create unique index funcoes_nome_key on public.funcoes (lower(btrim(nome)));
create trigger funcoes_set_updated_at before update on public.funcoes for each row execute function public.set_updated_at();
create trigger funcoes_historico after insert or update or delete on public.funcoes for each row execute function public.registrar_historico();

alter table public.funcoes enable row level security;
create policy "equipe: ler funcoes"      on public.funcoes for select to authenticated using (true);
create policy "equipe: inserir funcoes"  on public.funcoes for insert to authenticated with check (true);
create policy "equipe: atualizar funcoes" on public.funcoes for update to authenticated using (true) with check (true);
create policy "equipe: excluir funcoes"  on public.funcoes for delete to authenticated using (true);
revoke all on table public.funcoes from anon, public;
grant select, insert, update, delete on table public.funcoes to authenticated;
revoke truncate, references, trigger on table public.funcoes from authenticated;

insert into public.funcoes (nome, tipo_producao, ordem) values
  ('Técnico de Segurança do Trabalho', 'tecnico',        1),
  ('Administrativo',                   'administrativo', 2),
  ('Supervisor Geral',                 'nenhuma',        3),
  ('Supervisor ADM',                   'nenhuma',        4),
  ('Supervisor TST Externo',           'nenhuma',        5);

-- colaboradores: texto → FK (funções em uso não podem ser excluídas)
alter table public.colaboradores add column funcao_id uuid references public.funcoes(id) on delete restrict;
update public.colaboradores c set funcao_id = f.id from public.funcoes f where lower(btrim(f.nome)) = lower(btrim(c.funcao));
update public.colaboradores set funcao_id = (select id from public.funcoes where tipo_producao = 'tecnico' order by ordem limit 1) where funcao_id is null;
alter table public.colaboradores alter column funcao_id set not null;
alter table public.colaboradores drop column funcao;
create index colaboradores_funcao_id_idx on public.colaboradores (funcao_id);

-- ---------------------------------------------------------------------------
-- importar_backup v8: funções (upsert por nome) e colaboradores por nome da função
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
  insert into public.funcoes (nome, tipo_producao, ordem)
  select btrim(e.elem->>'nome'),
         case when e.elem->>'tipoProducao' in ('tecnico', 'administrativo', 'nenhuma') then e.elem->>'tipoProducao' else 'nenhuma' end,
         coalesce(nullif(e.elem->>'ordem', '')::int, 100 + e.n::int)
  from jsonb_array_elements(coalesce(p->'funcoes', '[]'::jsonb)) with ordinality as e(elem, n)
  where btrim(coalesce(e.elem->>'nome', '')) <> ''
  on conflict ((lower(btrim(nome)))) do update set tipo_producao = excluded.tipo_producao, ordem = excluded.ordem;

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
