-- 0025 — Porte por cliente (código do SGG). A importação pré-preenche o porte de cada
-- empresa por aqui e grava o que o usuário escolher na lista.
create table public.clientes_porte (
  codigo      text primary key check (btrim(codigo) <> ''),
  nome        text not null default '',
  porte       text not null references public.portes(codigo),
  updated_at  timestamptz not null default now()
);
comment on table public.clientes_porte is 'Porte de cada cliente, pelo código do SGG (Código Empresa). Usado pela importação da planilha.';

alter table public.clientes_porte enable row level security;
create policy "equipe: ler clientes_porte"       on public.clientes_porte for select to authenticated using (true);
create policy "equipe: inserir clientes_porte"   on public.clientes_porte for insert to authenticated with check ((select public.pode_editar()));
create policy "equipe: atualizar clientes_porte" on public.clientes_porte for update to authenticated using ((select public.pode_editar())) with check ((select public.pode_editar()));
create policy "equipe: excluir clientes_porte"   on public.clientes_porte for delete to authenticated using ((select public.pode_editar()));

create trigger clientes_porte_historico after insert or update or delete on public.clientes_porte for each row execute function public.registrar_historico();
