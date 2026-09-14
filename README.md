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
   pessoa com a chave publishable viraria `authenticated`). Crie o **primeiro**
   usuário em Authentication → Users → *Add user* (marque *Auto Confirm User*)
   e torne-o administrador:
   ```sql
   update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}') || '{"admin": true}'
   where email = 'admin@chabra.com.br';
   ```
4. **Edge Function `usuarios`:** faça o deploy de `supabase/functions/usuarios`
   (`supabase functions deploy usuarios` ou MCP `deploy_edge_function`, com
   `verify_jwt` ligado). Ela usa a chave secreta do ambiente da função
   (`SUPABASE_SECRET_KEYS` / `SUPABASE_SERVICE_ROLE_KEY`) — nada disso vai ao
   navegador.

## Usuários e papéis

- Papel de administrador = `app_metadata.admin = true` (só o servidor altera;
  o usuário não consegue editar `app_metadata`). A mudança de papel vale no
  próximo login do usuário afetado.
- Nome e sobrenome ficam em `user_metadata` (`nome`, `sobrenome`) e aparecem no
  programa no lugar do e-mail (menu lateral, lista de usuários).
- Administradores veem a tela **Usuários**: listar, criar (nome, sobrenome,
  e-mail, senha inicial, opcionalmente admin), editar nome, redefinir senha,
  promover/rebaixar, remover. A função recusa remover a si mesmo, alterar o
  próprio papel e remover o último admin.
- Qualquer usuário logado troca a própria senha em **Senha** (menu lateral).
- Não há fluxo "esqueci a senha": um admin redefine pela tela Usuários.

## Motor de cálculo (Fase 2)

Tudo roda no navegador, em [js/calculo.js](js/calculo.js) (funções puras; também
roda em Node para testes). Fórmulas:

```
horas_dia              = capacidade mensal cadastrada ÷ dias úteis de referência (Calendário)
capacidade_mes(colab)  = dias_uteis[mês] × horas_dia × eficiência
empresas_ponderadas    = baixo × fator_baixo + médio × fator_medio + alto × fator_alto
demanda_anual(doc)     = empresas_ponderadas × horas × (12 ÷ periodicidade)   (periodicidade 0 = fora do cálculo)
demanda_mes            = demanda_anual ÷ 12 (uniforme)
capacidade_planejável  = capacidade × ocupação-alvo
gap_horas              = capacidade_planejável − demanda
gap_colab              = gap_horas ÷ capacidade média por colaborador (mesma função)
```

- Capacidade por unidade = Σ capacidade do colaborador × percentual alocado; o nº de
  colaboradores aparece em FTE (ex.: 2,5). A conversão de gap em pessoas usa a capacidade
  média de um colaborador inteiro.
- Demanda e capacidade são calculadas **por função** (o documento diz quem o
  produz; o colaborador tem função) e somadas no total. A recomendação da visão
  *Total* combina as necessidades por função, porque técnico não produz documento
  administrativo.
- Recomendação: gap < 0 → "Contratar N" (arredonda para cima); sobra ≥ 1 → "Capacidade
  ociosa de N" (arredonda para baixo); senão "Quadro adequado".
- Status: vermelho = déficit; amarelo = folga menor que 10% da capacidade planejável;
  verde = suficiente.
- Colaborador sem unidade e documento sob demanda ficam fora, com aviso na tela.
- Telas: **Programação Anual** (consolidado por unidade + por função + demanda por
  documento + capacidade nominal por colaborador), **Programação Mensal** (12 meses,
  por unidade ou total, grade unidade × mês) e **Calendário** (dias úteis por mês +
  dias de referência). A janela (de/até) e os filtros ficam no navegador; a
  ocupação-alvo, os fatores e o calendário são parâmetros compartilhados (tabela
  `parametros`).

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
js/views/usuarios.js        tela Usuários (só admin) — chama a Edge Function `usuarios`
js/views/calendario.js      tela Calendário (dias úteis por mês, dias de referência)
js/views/programacao-mensal.js  tela Programação Mensal
js/views/programacao-anual.js   tela Programação Anual
js/calculo.js           motor de dimensionamento (puro)
js/programacao.js       utilitários das telas de programação (janela, barra, formatação)
js/app.js               inicialização, navegação por hash (#/unidades …), badges, backup
supabase/migrations/    SQL do banco (0001…0006; 0005 = alocação multiunidade)
supabase/functions/usuarios/index.ts   Edge Function de gestão de usuários (chave secreta só no servidor)
```

## Modelo de dados

Single-tenant: toda a equipe autenticada compartilha os mesmos cadastros
(policies `to authenticated using (true)`); `anon` não tem acesso.

| tabela          | colunas                                                                                   |
|-----------------|-------------------------------------------------------------------------------------------|
| `unidades`      | `id, nome (único), empresas_baixo/medio/alto (int ≥ 0), empresas (gerada = soma)`          |
| `documentos`    | `id, nome (único), horas, periodicidade_meses (int ≥ 0), responsavel (função)`             |
| `colaboradores` | `id, nome, funcao, horas_mes, eficiencia (1–100)`                                          |
| `colaborador_unidades` | `colaborador_id, unidade_id, percentual (0–100; soma por colaborador ≤ 100, gatilho)` |
| `parametros`    | linha única: `dias_uteis[12], fator_baixo/medio/alto, dias_referencia, ocupacao_alvo`      |

- `periodicidade_meses = 0` significa **sob demanda** (documento sem renovação periódica).
- Um colaborador pode atuar em várias unidades: `alocacoes = [{ unidadeId, percentual }]`.
  A capacidade dele entra em cada unidade multiplicada pelo percentual; a soma pode ser
  menor que 100% (o restante é "não alocado" e não conta) mas nunca maior. Salvo pela RPC
  `definir_alocacoes(colaborador, jsonb)` numa transação.
- No JS/backup as chaves são camelCase (`periodicidadeMeses`, `horasMes`, `empresasBaixo`…);
  o backup v3 inclui `parametros` e `alocacoes[{unidadeNome, percentual}]` nos colaboradores
  (a importação resolve a unidade pelo nome). Backups antigos: `empresas` → grau baixo;
  `unidadeNome` único → alocação de 100%.

## Backup e migração

- **Exportar JSON** baixa `{ unidades, documentos, colaboradores }`.
- **Importar JSON** valida, mostra um resumo e chama `importar_backup(jsonb)`,
  que substitui **todos** os dados numa única transação (para toda a equipe).
- Se o navegador ainda tiver dados da versão anterior (só `localStorage`), o app
  oferece enviá-los para a nuvem no primeiro login; depois guarda uma cópia em
  `chabra-dimensiona:backup-local` e não pergunta de novo.

## Fases

- **Fase 1 (feita):** cadastros + persistência na nuvem + login + backup + gestão de usuários.
- **Fase 2 (feita):** graus de dificuldade, calendário, motor de cálculo, Programação
  Mensal/Anual com recomendação.
- **Futuro:** apontamento de produção real por colaborador, feriados automáticos,
  distribuição não uniforme da demanda ao longo do ano.
