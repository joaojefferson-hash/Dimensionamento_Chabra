-- 0024 — Importação da planilha do SGG: substitui, numa transação, a demanda de um ano
-- das unidades presentes no lote. p_linhas = [{ unidade_id, mes, condicao, porte, quantidade }].
-- Roda como o usuário (RLS vale): só admin/supervisor conseguem gravar.
create or replace function public.substituir_demanda_ano(p_ano integer, p_linhas jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  apagadas integer;
  inseridas integer;
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

  with ids as (select distinct (e->>'unidade_id')::uuid as unidade_id from jsonb_array_elements(p_linhas) e where (e->>'unidade_id') ~ '^[0-9a-f-]{36}$')
  delete from public.demanda_mensal d using ids where d.unidade_id = ids.unidade_id and d.ano = p_ano;
  get diagnostics apagadas = row_count;

  insert into public.demanda_mensal (unidade_id, ano, mes, condicao, porte, quantidade)
  select (e->>'unidade_id')::uuid, p_ano, (e->>'mes')::int,
         case when e->>'condicao' = 'exclusiva_tst' then 'exclusiva_tst' else 'mensal' end,
         case when exists (select 1 from public.portes p where p.codigo = e->>'porte') then e->>'porte' else 'P' end,
         greatest(0, round(coalesce(nullif(e->>'quantidade', '')::numeric, 0)))::int
  from jsonb_array_elements(p_linhas) e
  where (e->>'unidade_id') ~ '^[0-9a-f-]{36}$'
    and (e->>'mes') ~ '^\d{1,2}$' and (e->>'mes')::int between 1 and 12
    and greatest(0, round(coalesce(nullif(e->>'quantidade', '')::numeric, 0)))::int > 0
    and exists (select 1 from public.unidades u where u.id = (e->>'unidade_id')::uuid)
  on conflict (unidade_id, ano, mes, condicao, porte) do update set quantidade = excluded.quantidade;
  get diagnostics inseridas = row_count;

  return jsonb_build_object('apagadas', apagadas, 'inseridas', inseridas);
end;
$$;
