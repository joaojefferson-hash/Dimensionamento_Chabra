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
- Telas: **Programação Anual** (um cartão por unidade + total), **Programação Mensal**
  (uma grade para técnicos e outra para administrativos: mês a mês consegue / precisa
  por entrega, equipe do mês, coluna **Faltam / sobram** — sempre em relação à equipe de
  hoje, não acumulado —, leitura "Mês a mês: … Contratando N a partir de X, nenhum mês
  fica descoberto" e a grade unidade × mês só com sinais) e
- **Fila de atendimento** (tela para a diretoria, `js/views/fila.js` + `Calculo.fila`): o que
  não é atendido num mês **acumula** no seguinte. Por unidade e grupo, mês a mês: entram
  (docs. vencidos), fila no início, o que a equipe consegue (gargalo do grupo: técnicos =
  a menor entre inspeções e relatórios), atendidas, fila no fim; situação = fila zerada /
  menos de um mês de entradas / mais de um mês. A partir do **mês atual** (seletor, por
  navegador; padrão = mês do calendário) e do **prazo para atender** (`parametros.prazo_dias`,
  padrão 60 = 2 meses): produção por dia da equipe, fila hoje (acumulado de janeiro ao mês
  anterior), entradas no prazo, **pessoas a contratar para cumprir o prazo** (por unidade,
  somadas no total), quando a fila zera sem contratar e a fila em dezembro. **Período**
  (de/até, o mesmo das programações): segunda linha de indicadores — fila no início,
  entram, equipe consegue, contratar no período (zerar a fila até o fim dele), fila no fim —
  e tabela/gráfico/grade só com os meses do período (a fila do primeiro mês já traz o
  acumulado anterior). Gráfico de barras (uma série) da fila no fim de cada mês; a
  simulação "E se…?" vale aqui também.
- **Simulação "E se…?"** (card nas programações e na fila): linhas com unidade, grupo,
  quantidade (+ contratar / − desligar), meses e ritmo por dia; viram pessoas virtuais
  no motor (`simulacoes` em `Calculo.calcular`), ativas só nos meses escolhidos; a
  equipe nunca fica negativa. Guardada só no navegador (`localStorage`), não entra no
  cadastro nem no backup; as contagens mostram "(+2 simulados)".
  **Calendário** (dias úteis por mês). Período e unidade ficam no navegador; folga,
  pesos e calendário são compartilhados (tabela `parametros`).
- O Catálogo de Documentos ficou oculto (não entra no cálculo neste modelo); a tela e a
  tabela continuam no código para uma fase futura.

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
js/views/catalogo.js        tela Catálogo de Documentos (oculta neste modelo)
js/views/colaboradores.js   tela Colaboradores (CRUD; função vem do cadastro de funções) + modo Organograma
js/organograma.js       organograma (hierarquia das funções de chefia + equipes por unidade) e barras por unidade
js/views/funcoes.js         tela Funções (nome, tipo de produção, chefia, ordem)
js/views/usuarios.js        tela Usuários (só admin) — chama a Edge Function `usuarios`
js/views/calendario.js      tela Calendário (dias úteis por mês, dias de referência)
js/views/programacao-mensal.js  tela Programação Mensal
js/views/programacao-anual.js   tela Programação Anual
js/views/fila.js            tela Fila de atendimento (backlog mês a mês, prazo, contratar para cumprir o prazo)
js/views/historico.js       tela Histórico de alterações
js/calculo.js           motor de dimensionamento (puro)
js/programacao.js       utilitários das telas de programação (janela, barra, formatação)
js/app.js               inicialização, navegação por hash (#/unidades …), badges, backup
supabase/migrations/    SQL do banco (0005 = alocação multiunidade, 0007 = empresas por mês, 0008 = produção diária, 0009 = frequência, 0010/0011 = histórico, 0012 = funções cadastráveis, 0013 = chefia, 0014 = coordena/responde_para, 0015 = situação da documentação no lugar do grau, 0016 = só documentos vencidos, 0017 = prazo para atender, 0018 = papéis na RLS, 0019 = ano nos valores por mês, 0020 = condição Exclusiva TST, 0021 = clientes ativos informativo)
supabase/functions/usuarios/index.ts   Edge Function de gestão de usuários (chave secreta só no servidor)
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
  barra das programações/fila; fica no navegador, `Store.ano`) define `u.meses`. O motor
  usa a quantidade de cada mês na demanda; a Programação Anual mostra a média na janela
  e marca "varia".
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
- **Futuro:** apontamento de produção real por colaborador, feriados automáticos,
  distribuição não uniforme da demanda ao longo do ano.
