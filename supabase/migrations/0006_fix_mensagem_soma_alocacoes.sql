-- ============================================================================
-- Chabra Dimensiona — 0006_fix_mensagem_soma_alocacoes
-- Mensagem do gatilho: "%%%" era lido como "%%" + "%" (saía "%120.00").
-- ============================================================================
create or replace function public.checar_soma_alocacoes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare total numeric;
begin
  select coalesce(sum(percentual), 0) into total
    from public.colaborador_unidades where colaborador_id = new.colaborador_id;
  if total > 100.0001 then
    raise exception 'A soma das alocações do colaborador não pode passar de 100%% (atual: %)', total || '%'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
