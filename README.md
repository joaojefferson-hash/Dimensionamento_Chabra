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

## Motor de cálculo (produção diária)

Tudo roda no navegador, em [js/calculo.js](js/calculo.js) (funções puras; também
roda em Node para testes). O modelo é declarado pelo usuário, sem horas:

```
precisa(unidade, entrega, mês) = empresas do mês × peso do grau ÷ meses entre atendimentos
                               (Calendário → "Com que frequência cada empresa é atendida?";
                                padrão 1 = toda empresa recebe inspeção, relatório e
                                finalização todo mês; 3 = um terço das empresas por mês)
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
- Frequência de atendimento (Calendário): a cada N meses **ou anos** por tipo de entrega.
- **Histórico**: gatilhos em todas as tabelas de cadastro gravam em `historico` (quem,
  quando, antes/depois); a tela Histórico mostra frases simples, com filtro. Importação
  de backup vira um único evento. Escrita só pelos gatilhos (security definer, fora da API).
- Telas: **Programação Anual** (um cartão por unidade + total), **Programação Mensal**
  (mês a mês: consegue / precisa por entrega + grade unidade × mês só com sinais) e
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
js/views/historico.js       tela Histórico de alterações
js/calculo.js           motor de dimensionamento (puro)
js/programacao.js       utilitários das telas de programação (janela, barra, formatação)
js/app.js               inicialização, navegação por hash (#/unidades …), badges, backup
supabase/migrations/    SQL do banco (0005 = alocação multiunidade, 0007 = empresas por mês, 0008 = produção diária, 0009 = frequência, 0010/0011 = histórico, 0012 = funções cadastráveis, 0013 = chefia, 0014 = coordena/responde_para)
supabase/functions/usuarios/index.ts   Edge Function de gestão de usuários (chave secreta só no servidor)
```

## Modelo de dados

Single-tenant: toda a equipe autenticada compartilha os mesmos cadastros
(policies `to authenticated using (true)`); `anon` não tem acesso.

| tabela          | colunas                                                                                   |
|-----------------|-------------------------------------------------------------------------------------------|
| `unidades`      | `id, nome (único), empresas_baixo/medio/alto (int ≥ 0), empresas (gerada = soma)`          |
| `documentos`    | `id, nome (único), horas, periodicidade_meses (int ≥ 0), responsavel (função)`             |
| `funcoes`       | `id, nome (único), tipo_producao (tecnico/administrativo/nenhuma), chefia (bool), coordena (todos/tecnicos/administrativos), responde_para → funcoes, ordem` |
| `colaboradores` | `id, nome, funcao_id → funcoes, empresas_dia, inspecoes_dia, relatorios_dia` (ritmo por dia) |
| `colaborador_unidades` | `colaborador_id, unidade_id, percentual (0–100; soma por colaborador ≤ 100, gatilho)` |
| `unidade_empresas_mes` | `unidade_id, mes (1–12), empresas_baixo/medio/alto` — exceção mensal; sem linha = padrão |
| `parametros`    | linha única: `dias_uteis[12], fator_baixo/medio/alto, ocupacao_alvo, meses_por_inspecao/relatorio/finalizacao` |

- `periodicidade_meses = 0` significa **sob demanda** (documento sem renovação periódica).
- A quantidade de empresas pode **variar por mês**: os campos da unidade são o padrão e a
  tabela `unidade_empresas_mes` guarda as exceções (os três graus daquele mês). O motor
  usa a quantidade de cada mês na demanda; a Programação Anual mostra a média na janela
  e marca "varia".
- Um colaborador pode atuar em várias unidades: `alocacoes = [{ unidadeId, percentual }]`.
  A capacidade dele entra em cada unidade multiplicada pelo percentual; a soma pode ser
  menor que 100% (o restante é "não alocado" e não conta) mas nunca maior. Salvo pela RPC
  `definir_alocacoes(colaborador, jsonb)` numa transação.
- No JS/backup as chaves são camelCase (`periodicidadeMeses`, `horasMes`, `empresasBaixo`…);
  o backup v6 inclui `funcoes[{nome, tipoProducao, chefia, coordena, respondePara (nome), ordem}]`, `parametros`,
  `empresasPorMes[{mes, empresasBaixo…}]` nas unidades e `alocacoes[{unidadeNome, percentual}]`
  + `funcao` (nome) nos colaboradores (a importação resolve unidade e função pelo nome;
  função desconhecida → função técnica padrão; funções do backup são criadas/atualizadas,
  nunca apagadas). Backups antigos: `empresas` → grau baixo; `unidadeNome` único → 100%.

## Backup e migração

- **Exportar JSON** baixa `{ funcoes, unidades, documentos, colaboradores, parametros }`.
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
