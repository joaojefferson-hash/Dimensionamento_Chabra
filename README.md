# Chabra Dimensiona

Ferramenta de dimensionamento de quadro para consultoria de Segurança e Saúde do
Trabalho (SST). Aplicação Vue 3 + Vite em `web/`, com dados na nuvem (Supabase)
compartilhados por toda a equipe e login por e-mail/senha.

O motor de cálculo (`js/calculo.js`) é puro — sem tela e sem banco — e é copiado
para `web/src/engine/` antes de cada build. Modelo documentado em
[docs/MODELO-DE-CALCULO.md](docs/MODELO-DE-CALCULO.md); 84 testes em `tests/`.

Manual completo do programa (telas, papéis, contas, rotina): [MANUAL.md](MANUAL.md).

## Como rodar

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm test         # 84 testes (motor, dimensionamento, sincronização, importação)
```

Precisa de internet: os dados ficam no Supabase.

## Hospedagem

Vercel, a partir do branch `main` (ver `vercel.json`): instala e builda em `web/`
e publica `web/dist`. Um `git push` publica.

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

- Três papéis, em `app_metadata.papel` (só o servidor altera; o usuário não
  consegue editar `app_metadata`). A mudança vale no próximo login do afetado.

  | papel        | vê                                              | edita                              |
  |--------------|-------------------------------------------------|------------------------------------|
  | `admin`      | tudo                                            | tudo; gerencia usuários; importa backup |
  | `supervisor` | cadastros (unidades, empresas, colaboradores, funções, calendário) e histórico | os cadastros |
  | `leitura`    | tudo (programações, fila, cadastros, histórico) | nada (diretoria, gerência, RH)     |

  Sem papel gravado: `admin = true` → admin; senão → leitura. `app_metadata.admin`
  continua sendo gravado (= papel admin) por compatibilidade.
- **RLS**: leitura de todas as tabelas para qualquer autenticado; escrita só quando
  `public.pode_editar()` (papel admin ou supervisor, lido do JWT por
  `public.papel_atual()`); `importar_backup` exige admin. O front esconde as telas
  fora do papel (`ACESSO` em `js/app.js`), desliga os controles que gravam no modo
  leitura (`aplicarSomenteLeitura`; controles só do navegador levam `data-local`:
  período, filtros, simulação, alternância de modo, impressão) e mostra o papel no
  rodapé do menu. Importar JSON só aparece para admin.
- Nome e sobrenome ficam em `user_metadata` (`nome`, `sobrenome`) e aparecem no
  programa no lugar do e-mail (menu lateral, lista de usuários).
- Administradores veem a tela **Usuários**: listar, criar (nome, sobrenome,
  e-mail, senha inicial, papel), editar nome, redefinir senha, trocar o papel
  (seletor na lista; Edge Function `definirPapel`), remover. A função recusa
  remover a si mesmo, alterar o próprio papel e remover o último admin.
- Qualquer usuário logado troca a própria senha em **Senha** (menu lateral).
- Não há fluxo "esqueci a senha": um admin redefine pela tela Usuários.

## Motor de cálculo (produção diária)

Tudo roda no navegador, em [js/calculo.js](js/calculo.js) (funções puras; também
roda em Node para testes). O modelo é declarado pelo usuário, sem horas:

```
precisa(unidade, entrega, mês) = clientes Mensal + Exclusiva TST com documentos vencidos no mês
                               (cada um exige uma inspeção, um relatório e uma finalização)
produção(pessoa, entrega, mês) = ritmo por dia × dias úteis do mês × % do tempo na unidade
consegue(unidade, entrega)   = Σ produção × (1 − folga para imprevistos)
sobra                        = consegue − precisa      (negativa = falta)
pessoas que faltam/sobram    = sobra ÷ produção de uma pessoa inteira no período
```

- Entregas: técnicos → inspeções por dia e relatórios por dia; administrativos →
  empresas finalizadas por dia. A situação dos técnicos é a pior das duas entregas.
- **Funções são cadastráveis** (tela Funções). Cada função tem um *tipo de produção*:
  `tecnico`, `administrativo` ou `nenhuma`. Quem tem função sem produção (supervisores)
  não tem ritmo diário e fica fora das contas. A função pode ser marcada como **chefia
  de equipe**: a pessoa aparece como "Chefia: Fulano (Supervisor ADM · administrativos)"
  nos cartões das unidades em que estiver alocada (para quem não produz, o tempo não é
  dividido — só se marcam as unidades). Uma chefia diz **quem coordena** (`coordena`:
  toda a equipe / só técnicos / só administrativos) e **para quem responde**
  (`responde_para`: outra função de chefia; vazio = topo; ciclos são barrados no form).
  Uma função em uso não pode ser excluída.
- **Organograma** (modo da tela Colaboradores, `js/organograma.js`): chefias na
  hierarquia das funções (Gerente → Supervisor Geral → Supervisor ADM; Supervisor TST
  Externo → Gerente); cada pessoa fica embaixo da chefia mais próxima que coordena o
  grupo dela na unidade (chefia específica ganha de "toda a equipe"; entre iguais, a
  mais baixa na hierarquia); "Sem chefia definida" e "Sem unidade" ficam à parte.
  Botão **Imprimir** imprime só a árvore (ou salva em PDF). Seletor **Folha**:
  Automática (retrato ou paisagem, a que couber melhor), Retrato ou Paisagem — lembrado
  no navegador. A árvore é reduzida para caber numa A4; se ficasse abaixo de 60%, ajusta
  só à largura e segue em mais páginas.
- Sinais: verde = dá conta; amarelo = no limite (sobra < 10%); vermelho = precisa contratar.
  As telas mostram frases prontas ("Faltam aproximadamente 3 técnicos…") em vez de
  números crus. O total soma as faltas das unidades (folga numa não cobre outra).
- "Folga para imprevistos" (padrão 15%) é o parâmetro `ocupacao_alvo` (85) visto pelo
  lado do usuário.
- **Histórico**: gatilhos em todas as tabelas de cadastro gravam em `historico` (quem,
  quando, antes/depois); a tela Histórico mostra frases simples, com filtro. Importação
  de backup vira um único evento. Escrita só pelos gatilhos (security definer, fora da API).
- Tela **Dimensionamento** (`js/views/dimensionamento.js`; substituiu Programação Anual,
  Programação Mensal e Fila de atendimento): barra ano · mês atual · unidade; bloco "Hoje"
  (pendentes hoje; técnicos e administrativos "hoje → ideal", "+N para zerar em 60 dias",
  produção por dia); tabela dos 12 meses (vencem, pendente no fim do mês, hoje → ideal por
  área, conclusão: passado "deveria ter contratado…" / futuro "contratar…", com a unidade
  onde falta); linha por unidade quando "Todas"; "E se…?" fechado (`<details>`); avisos.
  Motor: `Calculo.calcular` (mês a mês, `funcoes[f].ideal` = ceil(precisa ÷ produção de
  uma pessoa)) e `Calculo.fila` (pendentes: do primeiro mês em diante pendentes = sobra do
  anterior + lançado; meses passados atendidas = 0 — o lançado já é o que ficou em aberto;
  do mês atual em diante atendidas = min(pendentes, consegue), gargalo do grupo). No total,
  faltas/sobras/ideal são somados por unidade (folga numa não cobre outra).
- **Simulação "E se…?"** (bloco fechado no fim do Dimensionamento): linhas com unidade, grupo,
  quantidade (+ contratar / − desligar), meses e ritmo por dia; viram pessoas virtuais
  no motor (`simulacoes` em `Calculo.calcular`), ativas só nos meses escolhidos; a
  equipe nunca fica negativa. Guardada só no navegador (`localStorage`), não entra no
  cadastro nem no backup; as contagens mostram "(+2 simulados)".
  **Calendário** (dias úteis por mês + folga para imprevistos + prazo para atender). Mês atual
  e unidade ficam no navegador; folga, prazo e calendário são compartilhados (tabela `parametros`).
- O Catálogo de Documentos ficou oculto (não entra no cálculo neste modelo); a tela e a
  tabela continuam no código para uma fase futura.

## Estrutura

```
web/                    a aplicação (Vue 3 + Vite) — arquitetura detalhada em web/README.md
  src/views/            uma tela por arquivo: Headcount, Unidades, Empresas, Colaboradores,
                        Funções, Calendário, Histórico, Usuários, Login
  src/stores/           cadastros (cache do Supabase), preferências (navegador), dimensionamento (derivações)
  src/engine/calculo.js cópia do motor, gerada por scripts/sync-engine.mjs
js/calculo.js           MOTOR DE CÁLCULO (fonte): calcular, fluxo, headcount, fila, evolucao — funções puras
tests/                  testes do motor, do dimensionamento e da sincronização (node, sem framework)
docs/MODELO-DE-CALCULO.md   a matemática documentada, para auditar qualquer número
supabase/migrations/    SQL do banco (0001…0030)
supabase/functions/     usuarios (gestão de acessos) e sincronizar-sst (API de documentos)
MANUAL.md               manual do usuário    FUNCIONALIDADES.md  o que o programa faz, tela a tela
index.html, style.css, js/app.js, js/views/   PRIMEIRA VERSÃO, não publicada (só js/calculo.js segue em uso)
```

## Modelo de dados

Single-tenant: toda a equipe autenticada compartilha os mesmos cadastros
(policies `to authenticated using (true)`); `anon` não tem acesso.

| tabela          | colunas                                                                                   |
|-----------------|-------------------------------------------------------------------------------------------|
| `unidades`      | `id, nome (único), empresas_vencidas (Mensal), empresas_exclusiva_tst, clientes_ativos (informativo) — padrão` |
| `documentos`    | `id, nome (único), horas, periodicidade_meses (int ≥ 0), responsavel (função)`             |
| `funcoes`       | `id, nome (único), tipo_producao (tecnico/administrativo/nenhuma), chefia (bool), coordena (todos/tecnicos/administrativos), responde_para → funcoes, ordem` |
| `colaboradores` | `id, nome, funcao_id → funcoes, empresas_dia, inspecoes_dia, relatorios_dia` (ritmo por dia) |
| `colaborador_unidades` | `colaborador_id, unidade_id, percentual (0–100; soma por colaborador ≤ 100, gatilho)` |
| `unidade_empresas_mes` | `unidade_id, ano, mes (1–12), empresas_vencidas (Mensal), empresas_exclusiva_tst, clientes_ativos` — valor próprio do mês naquele ano; sem linha = padrão |
| `parametros`    | linha única: `dias_uteis[12], ocupacao_alvo, prazo_dias` |

- `periodicidade_meses = 0` significa **sob demanda** (documento sem renovação periódica).
- A quantidade de empresas com documentos vencidos pode **variar por mês e por ano**: o campo
  da unidade é o padrão (vale para todos os anos) e a tabela `unidade_empresas_mes` guarda os
  valores próprios por ano/mês. O **ano selecionado** (seletor em Empresas por Unidade e na
  barra do Dimensionamento; fica no navegador, `Store.ano`) define `u.meses`. O motor
  usa a quantidade de cada mês na demanda.
- Um colaborador pode atuar em várias unidades: `alocacoes = [{ unidadeId, percentual }]`.
  A capacidade dele entra em cada unidade multiplicada pelo percentual; a soma pode ser
  menor que 100% (o restante é "não alocado" e não conta) mas nunca maior. Salvo pela RPC
  `definir_alocacoes(colaborador, jsonb)` numa transação.
- No JS/backup as chaves são camelCase (`periodicidadeMeses`, `horasMes`, `empresasBaixo`…);
  o backup v11 inclui `funcoes[{nome, tipoProducao, chefia, coordena, respondePara (nome), ordem}]`, `parametros`,
  `empresasVencidas` (Mensal) + `empresasExclusivaTst` + `clientesAtivos` (só informativo) + `empresasPorMes[{ano, mes, empresasVencidas, empresasExclusivaTst, clientesAtivos}]` nas unidades (sem `ano` → ano corrente) e `alocacoes[{unidadeNome, percentual}]`
  + `funcao` (nome) nos colaboradores (a importação resolve unidade e função pelo nome;
  função desconhecida → função técnica padrão; funções do backup são criadas/atualizadas,
  nunca apagadas). Backups antigos: `empresasVencendo + empresasAVencer` → vencidas;
  `empresasBaixo + Medio + Alto` → vencidas; só `empresas` → vencidas; `unidadeNome` único → 100%;
  `fator*`, `peso*` e `mesesPor*` são ignorados.

## Backup e migração

- **Exportar JSON** (card "Backup dos dados" na tela Usuários, só admin) baixa
  `{ funcoes, unidades, documentos, colaboradores, parametros }`.
- **Importar JSON** valida, mostra um resumo e chama `importar_backup(jsonb)`,
  que substitui **todos** os dados numa única transação (para toda a equipe).
- Se o navegador ainda tiver dados da versão anterior (só `localStorage`), o app
  oferece enviá-los para a nuvem no primeiro login; depois guarda uma cópia em
  `chabra-dimensiona:backup-local` e não pergunta de novo.

## Fases

- **Fase 1 (feita):** cadastros + persistência na nuvem + login + backup + gestão de usuários.
- **Fase 2 (feita):** graus de dificuldade, calendário, Programação Mensal/Anual com
  recomendação; depois simplificada para o modelo de produção diária com linguagem simples.
- **Fase 3 (feita):** só documentos vencidos por mês, pendente acumulado, quadro ideal,
  papéis de acesso; as três telas de resultado viraram uma só (Dimensionamento).
- **Fase 5 (em andamento):** front novo em `web/` (Vue 3 + Vite + Pinia + Tailwind v4) contra o
  mesmo banco e o mesmo motor (sincronizado de `js/calculo.js` por `web/scripts/sync-engine.mjs`).
  Etapa 3 feita: serviços (`src/services/api.js`), stores (`auth`, `cadastros`, `preferencias`,
  `dimensionamento`), router com guard por papel, layout e login. Etapa 4 feita: Dimensionamento
  completo (TabelaMeses, PorUnidade, Simulacao) e todas as telas de cadastro (falta só o modo
  Organograma). **Em produção desde 15/09/2026**: `vercel.json` na raiz manda o Vercel instalar e
  buildar em `web/` e publicar `web/dist`. O app vanilla (raiz: `index.html`, `js/`, `style.css`)
  continua no repositório como referência/rollback (basta apagar o `vercel.json`). Ver `web/README.md`.
- **Fase 4 (feita, migração 0022):** porte do cliente (tabela `portes` com peso; demanda
  normalizada em `demanda_mensal` por unidade × ano × mês × condição × porte; `unidade_mes`
  para clientes ativos), ramp-up de contratações (`colaboradores.data_admissao` /
  `data_desligamento`, `parametros.rampup`), impacto financeiro (`funcoes.custo_mensal`,
  `colaboradores.custo_mensal` opcional). Motor: `presencaNoMes`, `fatorRampup`,
  `empresasPonderadas` (Σ quantidade × peso), `funcoes[f].custo` {pessoa, contratar, sobra};
  `calcular` recebe `ano`. Testes: `node tests/calculo.test.js`. Backup v12.
- **Futuro:** apontamento de produção real por colaborador, feriados automáticos,
  distribuição não uniforme da demanda ao longo do ano.
