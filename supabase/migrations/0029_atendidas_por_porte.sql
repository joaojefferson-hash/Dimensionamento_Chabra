-- 0029 — Atendidas por porte (UEP consistente entre demanda e atendimento)
--   * unidade_mes.atendidas_porte (jsonb): { "P": 10, "M": 2 } — o total em `atendidas` vira compatibilidade
--   * importar_backup_unidade_mes(): bloco dedicado, usado por importar_backup (backup v14)
-- O motor passa a converter atendimento em UEP pelo peso de cada porte, sem a aproximação pelo peso médio.

alter table public.unidade_mes add column if not exists atendidas_porte jsonb not null default '{}'::jsonb;

update public.unidade_mes
   set atendidas_porte = jsonb_build_object('P', atendidas)
 where atendidas > 0 and (atendidas_porte = '{}'::jsonb or atendidas_porte is null);

comment on column public.unidade_mes.atendidas_porte is 'Empresas concluídas no mês, por porte: {"P":10,"M":2}. Entra no cálculo da fila.';
comment on column public.unidade_mes.atendidas is 'Total concluído no mês (compatibilidade); a fonte é atendidas_porte.';

create or replace function public.importar_backup_unidade_mes(p jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  insert into public.unidade_mes (unidade_id, ano, mes, clientes_ativos, atendidas, atendidas_porte)
  select u.id,
         coalesce(nullif(m->>'ano', '')::int, extract(year from now())::int),
         (m->>'mes')::int,
         greatest(0, round(coalesce(nullif(m->>'clientesAtivos', '')::numeric, 0)))::int,
         greatest(0, round(coalesce(nullif(m->>'atendidas', '')::numeric, 0)))::int,
         case when jsonb_typeof(m->'atendidasPorte') = 'object' then m->'atendidasPorte'
              when greatest(0, round(coalesce(nullif(m->>'atendidas', '')::numeric, 0)))::int > 0
                then jsonb_build_object('P', greatest(0, round(coalesce(nullif(m->>'atendidas', '')::numeric, 0)))::int)
              else '{}'::jsonb end
  from jsonb_array_elements(coalesce(p->'unidades', '[]'::jsonb)) with ordinality as e(elem, n)
  join public.unidades u on u.created_at = now() + (e.n * interval '1 millisecond')
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(e.elem->'clientesAtivosPorMes') = 'array' then e.elem->'clientesAtivosPorMes'
         when jsonb_typeof(e.elem->'empresasPorMes') = 'array' then e.elem->'empresasPorMes'
         else '[]'::jsonb end) as m
  where (m->>'mes') ~ '^\d{1,2}$' and (m->>'mes')::int between 1 and 12
    and coalesce(nullif(m->>'ano', '')::int, extract(year from now())::int) between 2000 and 2100
    and (greatest(0, round(coalesce(nullif(m->>'clientesAtivos', '')::numeric, 0)))::int > 0
      or greatest(0, round(coalesce(nullif(m->>'atendidas', '')::numeric, 0)))::int > 0
      or jsonb_typeof(m->'atendidasPorte') = 'object')
  on conflict (unidade_id, ano, mes) do update
    set clientes_ativos = excluded.clientes_ativos, atendidas = excluded.atendidas, atendidas_porte = excluded.atendidas_porte;
end;
$$;

revoke all on function public.importar_backup_unidade_mes(jsonb) from public;

-- importar_backup passa a delegar esse bloco (aplicado por reescrita do corpo da função no banco;
-- ver 0028 para o corpo completo anterior).
