# Chabra Dimensiona

Ferramenta de dimensionamento de quadro para consultoria de Segurança e Saúde do
Trabalho (SST). App web independente — HTML/CSS/JS vanilla, sem framework e sem
build step. Dados na nuvem (Supabase), compartilhados por toda a equipe, com
login por e-mail/senha.

## Como rodar

**Live Server (VS Code):** abra a pasta no VS Code, clique com o botão direito em
`index.html` → *Open with Live Server*.

**Qualquer servidor estático:** `python -m http.server 5500` e acesse
`http://localhost:5500`.

Precisa de internet: o `supabase-js` vem do CDN (jsDelivr, versão pinada) e os
dados ficam no Supabase.

## Hospedagem

Site estático: basta publicar a pasta inteira (Vercel, Netlify, GitHub Pages,
Nginx…). Nenhuma configuração extra.

## Configuração do Supabase (uma vez por projeto)

1. **Banco:** rode `supabase/migrations/0001_init.sql` no projeto (SQL Editor do
   dashboard ou MCP `apply_migration`). Cria as tabelas, RLS, grants para
   `authenticated`, a função `importar_backup` e o catálogo padrão.
2. **Chave:** em `js/config.js`, informe `SUPABASE_URL` e a chave **publishable**
   (Project Settings → API Keys → `sb_publishable_…`). Ela é pública por design;
   nunca use a secret/service_role no app.
3. **Auth:** Authentication → Sign In / Providers → Email → desligue
   **"Allow new users to sign up"** (obrigatório: com signup aberto, qualquer
   pessoa com a chave publishable viraria `authenticated`). Crie os usuários da
   equipe em Authentication → Users → *Add user* (marque *Auto Confirm User*).
4. Reset de senha: por enquanto é feito pelo admin no dashboard (não há fluxo
   "esqueci a senha" no app).

## Estrutura

```
index.html              casca da aplicação (telas de login/carregando, menu lateral, diálogo, toasts)
style.css               identidade visual (verde institucional #006B54)
js/config.js            URL e chave publishable do Supabase
js/ui.js                utilitários: escape, formatação, toast, confirmação, busy
js/auth.js              cliente Supabase (`db`) + sessão (login/logout)
js/store.js             cache em memória sobre as tabelas + exportar/importar JSON
js/views/unidades.js        tela Unidades (CRUD)
js/views/empresas.js        tela Empresas por Unidade (quantidade por unidade)
js/views/catalogo.js        tela Catálogo de Documentos SST (CRUD, pré-carregado)
js/views/colaboradores.js   tela Colaboradores (CRUD)
js/app.js               inicialização, navegação por hash (#/unidades …), badges, backup
supabase/migrations/    SQL do banco (0001_init.sql)
```

## Modelo de dados

Single-tenant: toda a equipe autenticada compartilha os mesmos cadastros
(policies `to authenticated using (true)`); `anon` não tem acesso.

| tabela          | colunas                                                            |
|-----------------|--------------------------------------------------------------------|
| `unidades`      | `id, nome (único), empresas (int ≥ 0)`                              |
| `documentos`    | `id, nome (único), horas (numeric), periodicidade_meses (int ≥ 0)`  |
| `colaboradores` | `id, nome, funcao, horas_mes (numeric), eficiencia (1–100)`         |

- `periodicidade_meses = 0` significa **sob demanda** (documento sem renovação periódica).
- No JS/backup as chaves são camelCase (`periodicidadeMeses`, `horasMes`).

## Backup e migração

- **Exportar JSON** baixa `{ unidades, documentos, colaboradores }`.
- **Importar JSON** valida, mostra um resumo e chama `importar_backup(jsonb)`,
  que substitui **todos** os dados numa única transação (para toda a equipe).
- Se o navegador ainda tiver dados da versão anterior (só `localStorage`), o app
  oferece enviá-los para a nuvem no primeiro login; depois guarda uma cópia em
  `chabra-dimensiona:backup-local` e não pergunta de novo.

## Fases

- **Fase 1 (feita):** cadastros + persistência na nuvem + login + backup.
- **Fase 2 (próxima):** motor de cálculo de demanda, seletor de janela de tempo,
  indicadores de gap / produtividade / quadro ideal.
