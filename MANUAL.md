# Chabra Dimensiona — Manual do programa

> Dimensionamento de quadro para a consultoria de Segurança e Saúde do Trabalho (SST) da Chabra.
> Visão geral de todas as funcionalidades: [FUNCIONALIDADES.md](FUNCIONALIDADES.md).
> Endereço: https://dimensionamento-chabra.vercel.app · Acesso com e-mail e senha fornecidos pelo administrador.

Este documento descreve o programa inteiro: para que serve, quem acessa o quê, cada tela, como as contas são feitas e o que fazer no dia a dia. A parte técnica (código, banco, publicação) está no final.

---

## 1. Para que serve

O Chabra Dimensiona responde a três perguntas, com a equipe que a Chabra tem hoje:

1. **Quanto a equipe produz?** Cada colaborador declara o seu ritmo por dia (inspeções, relatórios ou empresas finalizadas). O programa transforma isso em produção por mês, unidade por unidade.
2. **Quanto trabalho existe?** Em cada unidade, mês a mês, quantos clientes têm documentos vencendo naquele mês — separados por condição: **Mensal**, **Exclusiva TST**, **Empresa sem avaliação** e **Contratos novos**.
3. **Quantos colaboradores para dar conta do que está vencido?** A tela **Headcount** responde por unidade e por mês: o vencido acumulado, a equipe atual e quantas pessoas faltam para zerar tudo no prazo escolhido — 1, 2, 3, 6 ou 12 meses.

Tudo fica na nuvem, compartilhado pela equipe. Cada alteração de cadastro é registrada no **Histórico** (quem, quando, o que mudou).

---

## 2. Acesso e papéis

O administrador cria os usuários (nome, sobrenome, e-mail, senha inicial) e escolhe o papel de cada um na tela **Usuários**. O papel vale no próximo login da pessoa.

> **Versões novas.** Quem deixa a aba aberta continua com a versão carregada no primeiro acesso. Quando uma atualização é publicada, aparece a faixa **"Nova versão disponível"** no topo da tela, com o botão **Atualizar agora**; a verificação ocorre ao voltar para a aba e a cada 10 minutos. Recarregar a página (F5) tem o mesmo efeito.

| Papel | Vê | Altera |
|---|---|---|
| **Administrador** | tudo | tudo; gerencia usuários; exporta/importa backup |
| **Supervisão** | Cadastros (Unidades, Empresas por Unidade, Colaboradores, Funções, Calendário) e Histórico | os cadastros |
| **Leitura** (diretoria, gerência, RH) | tudo: dimensionamento, cadastros, histórico | nada |

No acesso de **Leitura**, os formulários e botões que gravam ficam desligados e um aviso aparece no topo; continuam funcionando o ano, o mês atual, a unidade, o prazo de eliminação, os filtros, a alternância Cadastro/Organograma e a impressão (tudo isso fica só no navegador de quem usa).

A proteção não é só visual: o banco de dados recusa gravações de quem não pode editar.

Não há "esqueci a senha" nem troca de senha pelo próprio usuário: o administrador redefine na tela **Usuários** e informa a nova senha à pessoa.

---

## 3. O menu

| Seção | Tela | Para quê |
|---|---|---|
| Dimensionamento | **Headcount** | A tela de resultado: quantos colaboradores para eliminar os documentos vencidos acumulados até o mês, no prazo escolhido. Com impressão. |
| Cadastros | **Unidades** | As unidades/filiais. |
| Cadastros | **Empresas por Unidade** | Por unidade e mês: clientes ativos (informativo) e os clientes com documentos a vencer, por condição (Mensal, Exclusiva TST, Empresa sem avaliação, Contratos novos). |
| Cadastros | **Colaboradores** | A equipe, com função, ritmo por dia e unidades onde atua. Modo **Organograma**. |
| Cadastros | **Funções** | As funções (técnico, administrativo, supervisões, gerência), o que cada uma entrega e a hierarquia de chefia. |
| Cadastros | **Calendário** | Dias úteis de cada mês; margem para imprevistos, prazo de atendimento, período de adaptação e pesos dos portes. |
| Acompanhamento | **Histórico** | Tudo o que mudou nos cadastros: quem, quando, antes/depois. |
| Administração | **Usuários** | Só admin: acessos, papéis, senhas e backup. |

Configurações que ficam no **seu navegador** (não afetam os outros): ano selecionado, mês atual, unidade escolhida, prazo de eliminação, filtros, modo da tela Colaboradores e orientação de impressão.

Configurações **compartilhadas** (valem para toda a equipe, gravadas no banco): dias úteis, folga para imprevistos e prazo para atender.

---

## 4. Cadastros

### 4.1 Unidades

Nome de cada unidade/filial. A tela mostra a média mensal de clientes do ano selecionado. Excluir uma unidade apaga também os números por mês dela e a alocação dos colaboradores nela.

### 4.2 Empresas por Unidade

A base da demanda. Para cada unidade há três linhas por mês (janeiro a dezembro do **ano selecionado**), e cada cliente tem um **porte** (Pequeno, Médio ou Grande) que multiplica o esforço:

- **Clientes ativos** — total de clientes da unidade no mês. **Só informativo** (histórico da carteira); não entra em nenhuma conta.
- **Mensal** — clientes com contrato mensal cujos documentos vencem naquele mês.
- **Exclusiva TST** — clientes na condição Exclusiva TST cujos documentos vencem naquele mês.
- **Atendidas no mês** — empresas efetivamente concluídas no mês, **no porte selecionado** (como as demais linhas). Diferente de Clientes ativos, **entra no cálculo**: é o que sai da fila em todas as telas de dimensionamento. Em branco, o mês decorrido acumula tudo o que venceu.
- **Empresa sem avaliação** — clientes ainda sem avaliação realizada naquele mês.
- **Contratos novos** — clientes de contratos firmados naquele mês.
- **Total** = soma das quatro condições (é o que o Headcount usa, com cada cliente valendo o peso do seu porte). As condições servem para organizar a origem da demanda: todas exigem o mesmo atendimento e pesam igual, variando apenas pelo porte do cliente.

**Porte.** O seletor **Porte** (Pequeno · Médio · Grande · Todos) define o que você está digitando: escolha um porte e lance os números daquele porte; troque e lance os de outro. Em **Todos**, as células mostram a soma dos portes (só leitura; passe o mouse para ver "P 20 · M 3 · G 2") e a linha Total mostra entre parênteses o **esforço equivalente** (cada cliente × o peso do porte: P 1,0 · M 1,5 · G 2,0, editáveis no Calendário). Ex.: 75 pequenos + 2 grandes = 77 clientes, esforço 79.

Cada cliente do Total precisa, naquele mês, de **uma inspeção e um relatório** (técnicos) e **uma finalização** (administrativos).

**Importar do SGG.** Em vez de digitar, exporte do SGG o relatório desejado (.xlsx) — por exemplo *Vencimento(s) de PGR(s)* e use o card *Importar do SGG* no topo da tela. O sistema reconhece as colunas do relatório: **Região** (unidade), **Data Validade** (o mês), **Empresa** e **Código Empresa** (cada estabelecimento conta uma vez por mês, mesmo com vários documentos), **Situação** (por padrão entram os "Vencido"; renovados/em dia ficam de fora) e **Informações adicionais da Empresa** ("Mensal…" → Mensal; texto com "Exclusiva"/"TST" → Exclusiva TST). Porte: o relatório não traz; abra **"Ver as N empresas do arquivo"** e escolha o porte de cada empresa na coluna Porte — a prévia muda na hora (o mês passa a mostrar o esforço equivalente entre parênteses) e a escolha **fica guardada pelo Código Empresa**: na próxima importação as empresas já vêm classificadas, só as novas precisam de atenção. Empresas sem escolha entram com o porte padrão do seletor (Pequeno). A lista também mostra, para cada empresa, o vencimento, o mês, a condição, a situação e se entra ou não (e por quê). Confira o **ano** (o relatório de vencidos costuma trazer o ano anterior) e a prévia por unidade × mês, com o número que está hoje ("era N"); unidades que não casarem com o cadastro aparecem em vermelho. Só ao clicar em **Importar** os números daquele ano, nas unidades presentes no arquivo, são substituídos — e **apenas da condição selecionada**: com Condição = Exclusiva TST, por exemplo, só os lançamentos Exclusiva TST são substituídos e as demais condições ficam como estão; com a condição lida da coluna do arquivo, todas são substituídas. Clientes ativos nunca mudam. Fica registrado no Histórico.

**Relatórios sem data de vencimento** (por exemplo, *Relatório de empresas sem avaliação de risco*): quando a planilha não traz coluna de data, aparece o seletor **Mês de referência** — escolha o mês e todas as linhas do arquivo contam nele, no ano selecionado no topo da tela. Combine com **Condição = Empresa sem avaliação** (ou a que corresponder) para que a importação substitua somente aquela condição.

**O que ficou em aberto no ano anterior passa para janeiro.** Se 2025 tem 65 clientes vencidos e ainda em aberto, o Headcount de 2026 começa janeiro com esses 65 — o cartão "Vencido acumulado" mostra "inclui 65 vindo de 2025". Por isso vale importar o relatório de vencidos do ano anterior.

Como usar: digite o número em cada mês; célula vazia conta como zero; tudo salva automaticamente. O seletor **Mostrar** filtra por condição; o seletor **Ano** troca o ano (os números são por ano; dá para preencher 2027 sem mexer em 2026). "limpar 2026" apaga todos os números daquela unidade no ano. À direita, **Acumulado até [mês atual]** (soma de janeiro até o mês atual: o que venceu e ainda está em aberto + o que vence neste mês — é o "Vencido acumulado até o mês" do Headcount; o mês atual é o escolhido lá), **Total do ano** (soma dos 12 meses) e **Média** mensal; no rodapé, as somas de todas as unidades.

> Preencha em cada mês **só os documentos que vencem naquele mês** — nos meses que já passaram, os que venceram ali e **ainda estão em aberto**. Não precisa somar o que veio de meses anteriores: o sistema acumula isso sozinho (ver capítulo 6).

### 4.3 Funções

Cada função diz o que a pessoa entrega:

- **Técnico** — faz inspeções e relatórios; entra na programação como técnico.
- **Administrativo** — finaliza empresas; entra como administrativo.
- **Sem produção** — não tem ritmo diário e fica fora das contas (supervisores, gerência).

Uma função pode ser **chefia de equipe**. Nesse caso informa-se **quem coordena** (toda a equipe / só os técnicos / só os administrativos) e **para quem responde** (outra chefia; vazio = topo). Isso monta o organograma e a linha "Chefia:" das programações. Hoje: Gerente de Segurança do Trabalho (topo, coordena todos) → Supervisor Geral (coordena todos) → Supervisor ADM (só administrativos); Supervisor TST Externo (só técnicos) responde ao Gerente.

**Custo mensal de uma pessoa** (R$, salário + encargos, em média): opcional. Com ele o Headcount mostra quanto custa contratar quem falta. Vazio = sem valores em R$.

Uma função em uso não pode ser excluída; a ordem da lista (▲▼) é a ordem de exibição.

### 4.4 Colaboradores

Para cada pessoa: nome, função e o **ritmo por dia**, que é dela — não há fórmula automática:

- Técnico: quantas **inspeções por dia** e quantos **relatórios por dia**.
- Administrativo: quantas **empresas finalizadas por dia**.
- Sem produção: não há ritmo; se for chefia, só se marcam as unidades que ela lidera.

**Data de admissão** (opcional): a pessoa só conta a partir dela (o mês de entrada conta proporcional aos dias) e entra em **ramp-up** — produz menos nos primeiros meses de casa (padrão: 1º mês 50%, 2º mês 80%, depois 100%; a curva fica no Calendário). Sem data = veterano, 100% desde sempre. **Data de desligamento** (opcional): a partir dela a pessoa sai das contas; o cadastro fica para o histórico. Com as datas, o sistema passa a usar a equipe real de cada mês. **Custo mensal** (opcional): sobrepõe o custo médio da função.

**Unidades onde atua**: marque as unidades e divida o tempo em percentuais (a soma pode ficar abaixo de 100% — o resto não entra na programação — mas não acima). Quem divide o tempo conta proporcionalmente em cada unidade.

Lista com busca, filtro por função/unidade e colunas Vigência (desde mês/ano, "adaptação 50%", "até dd/mm/aaaa (desligado)"), Unidades e Alocação. Pessoas sem unidade aparecem com aviso e não entram na programação.

**Modo Organograma** (alternância no topo da tela): indicadores da equipe, barras de colaboradores por unidade e a árvore de chefias — cada colaborador fica sob a chefia mais próxima que coordena a sua área naquela unidade; "Sem chefia definida" (nenhuma chefia coordena essa área na unidade) e "Sem unidade" ficam à parte. A hierarquia vem das funções: chefia e "Subordinada a" (tela Funções). Clicar em um nome abre a edição do colaborador. O botão **Imprimir** gera somente o organograma (ou salva em PDF pelo diálogo do navegador), com escolha da folha — automática, retrato ou paisagem — e redução automática para caber na página.

### 4.5 Calendário

Dias úteis de cada mês (padrão 2026 = dias de semana menos feriados nacionais; botão para restaurar). É o que transforma ritmo por dia em produção por mês. O calendário é único, vale para todos os anos.

Abaixo, os **parâmetros do dimensionamento**, compartilhados por todos: **margem para imprevistos** (%; padrão 15), **prazo de atendimento** (dias; padrão 60) e o **período de adaptação** de quem é contratado (na tela; "ramp-up" neste manual) (1º, 2º e 3º mês de casa, em %; padrão 50 / 80 / 100 — vale para quem tem data de admissão e para as contratações simuladas). Depois, o **porte dos clientes**: o peso de Pequeno, Médio e Grande (padrão 1,0 / 1,5 / 2,0).

---

## 5. Como as contas são feitas

> A matemática completa, com fórmulas e premissas, está em [docs/MODELO-DE-CALCULO.md](docs/MODELO-DE-CALCULO.md).
> Em resumo: tudo é medido em **UEP** (clientes × peso do porte); as três etapas (inspeção → relatório →
> finalização) formam uma **cadeia**, e cada uma só processa o que a anterior concluiu; o **backlog** é a soma
> das filas das etapas, guarda o mês de origem e é consumido do mais antigo para o mais novo; o **quadro
> necessário** aparece em três leituras (operacional, recuperação e estrutural).

Linguagem da tela: nunca "capacidade", "fator" ou "gap" — sempre frases prontas ("A equipe consegue até 141 inspeções por mês; a carteira precisa de 55", "Faltam aproximadamente 2 técnicos…") e sinais de cor.

### 5.1 Produção da equipe

```
produção de uma pessoa no mês = ritmo por dia × dias úteis do mês × % do tempo na unidade
                                × presença no mês (admissão/desligamento, proporcional aos dias)
                                × ramp-up (1º mês de casa 50%, 2º 80%, depois 100% — configurável)
produção da equipe (consegue)  = soma das pessoas × (1 − folga para imprevistos)
```

- **Folga para imprevistos** (Calendário; padrão 15%): parte do tempo reservada a faltas, retrabalho e urgências. Com 15%, conta-se que cada pessoa entrega 85% do que declarou.
- Técnicos têm duas entregas (inspeções e relatórios); a situação deles é a pior das duas. O que limita hoje são os relatórios (2 inspeções e 1 relatório por dia).

### 5.2 Demanda

```
precisa (unidade, mês) = Σ clientes que vencem no mês × peso do porte   (P 1,0 · M 1,5 · G 2,0)
```

Cada cliente exige uma inspeção, um relatório e uma finalização naquele mês; um cliente grande exige o dobro de um pequeno.

### 5.3 Situação e pessoas

- **Vencido acumulado** = o que venceu nos meses anteriores e não foi concluído, mais o que vence no mês. Atravessa a virada do ano: o que ficou em aberto em 2025 continua contando em 2026, com a idade preservada.
- **Trabalho do período** = o vencido acumulado + o que vence durante o prazo de eliminação escolhido.
- **Quadro necessário** = trabalho do período ÷ prazo ÷ o que uma pessoa inteira faz no mês (já com a margem para imprevistos), arredondado para cima. O quadro de uma área é o da atividade mais exigente, porque é a mesma pessoa que cobre as atividades da sua área.
- **Déficit** = quadro necessário − equipe atual, medida em **equivalente de tempo integral** (por isso pode haver uma unidade de diferença em relação à contagem de pessoas).
- **Impacto financeiro** (só com o custo mensal cadastrado nas Funções): custo de uma pessoa = o do colaborador ou, se vazio, o da função (média da equipe da unidade). O déficit vira um custo mensal no cartão e na tabela.

## 6. Headcount (a tela de resultado)

> Terminologia da tela: **vencido acumulado** = documentos em aberto dos meses anteriores mais os deste mês; **prazo de eliminação** = em quantos meses zerar esse acumulado; **equivalente em tempo integral** = a soma das frações de jornada (quem está 80% na unidade conta 0,8).

Uma tela só, sempre de **uma unidade por vez**. Na barra do topo: **ano**, **mês atual**, **unidade** e o **prazo de eliminação** (1, 2, 3, 6 ou 12 meses). Dias úteis, margem para imprevistos e prazo de atendimento ficam no Calendário.

### 6.1 Os quatro cartões

- **Vencido acumulado até o mês** — em UEP, informando quanto veio de anos anteriores. O vencido não zera na virada do ano.
- **Vence no mês** — os vencimentos do próprio mês, com o número de clientes.
- **Equipe atual** — quantas pessoas estão alocadas na unidade e a quanto equivalem em tempo integral.
- **Faltam para eliminar em N meses** — o déficit e o quadro necessário, com o custo mensal quando há custo cadastrado nas Funções.

### 6.2 Equipe da unidade

A lista de conferência, pessoa por pessoa: alocação nesta unidade, presença no mês (quem entrou ou saiu no meio dele), produção diária declarada e quanto cada um equivale. A chefia alocada aparece à parte — coordena e não entra no quadro. Serve para o número da equipe bater com o cadastro de Colaboradores.

### 6.3 Quadro necessário para o prazo escolhido

Uma linha, a do prazo selecionado na barra: o trabalho total do período (o vencido acumulado mais o que vence durante o prazo), o volume mensal, o quadro por área, o total, o déficit e o custo. Prazos que passam de dezembro usam a média do ano e vêm marcados como **estimados**.

### 6.4 Onde entra cada pessoa

O mesmo cálculo por área. Inspeção e relatório são atividades do **mesmo técnico**: aparecem na mesma linha e contam como uma pessoa só — quando uma delas exige mais gente, é ela que define o quadro da área. O administrativo responde pela finalização.

### 6.5 Há quanto tempo está vencido

Faixas de 30 dias, a parcela fora do prazo de atendimento e a idade do documento mais antigo.

### 6.6 Gráficos

O quadro necessário em cada um dos cinco prazos, empilhado por área, com a equipe de hoje como linha de referência — é onde se vê a troca entre prazo e contratação. Ao lado, a idade do vencido por faixa.

> **Avisos quando faltam dados.** Quem está alocado na unidade com produção diária zerada é nomeado no topo da tela: conta no quadro e não produz, então o déficit aparece maior do que a realidade até a produção ser informada em Colaboradores.

Alterar um lançamento recalcula **daquele mês em diante**: os meses anteriores não mudam, e a fila de dezembro de um ano entra em janeiro do seguinte.

---

## 7. Histórico

Lista, por dia, tudo o que mudou nos cadastros: quem fez, quando e o quê ("Alterou a unidade Teresópolis — clientes Mensal: 56 → 75", "Alocou Fulano em Petrópolis com 100% do tempo", "Cadastrou a função Supervisor ADM…"). Filtro por texto, "Carregar mais", "Atualizar". Uma importação de backup vira um único evento. Registrado pelo próprio banco (gatilhos), não dá para editar.

---

## 8. Backup

Tela Usuários (admin) → **Backup dos dados**: **Exportar JSON** baixa tudo (funções, unidades com os números por ano/mês, colaboradores com alocações, parâmetros). **Importar JSON** substitui todos os dados atuais, para toda a equipe — use só para restaurar. Backups de versões antigas do programa continuam importáveis (o programa converte).

---

## 9. Rotina sugerida

1. **Todo mês**: em Empresas por Unidade, lançar em cada unidade os clientes ativos e, em cada condição (Mensal, Exclusiva TST, Empresa sem avaliação, Contratos novos), quantos **vencem no mês** (só o do mês; o acumulado o programa calcula) — e, se souber, o que vence nos próximos meses.
2. Manter Colaboradores em dia: quem entrou/saiu, ritmo por dia, unidades e percentuais.
3. Conferir no **Headcount**, unidade por unidade: o vencido acumulado, a equipe atual e quantos faltam para zerar no prazo pretendido.
4. Para a diretoria: a mesma tela, trocando o prazo de eliminação para mostrar a troca entre pressa e contratação — e imprimindo o resultado.
5. De tempos em tempos, exportar um backup.

---

## 10. Glossário

| Termo | Significado |
|---|---|
| Ritmo por dia | O que uma pessoa declara fazer num dia normal (inspeções, relatórios ou empresas finalizadas). |
| Dias úteis | Dias de trabalho do mês (Calendário). |
| Folga para imprevistos | % do tempo reservado; o programa conta que cada pessoa entrega (100 − folga)% do ritmo. |
| Consegue | Quanto a equipe entrega no mês, já com a folga. |
| Precisa | Clientes de todas as condições que vencem no mês (cada um = 1 inspeção, 1 relatório, 1 finalização). |
| Faltam / sobram | Pessoas inteiras a mais ou a menos para o mês, em relação à equipe de hoje. |
| Quadro ideal | Pessoas inteiras necessárias para dar conta do que vence no mês (o que precisa ÷ o que uma pessoa inteira faz no mês, arredondado para cima). |
| Pessoa inteira | Uma pessoa 100% do tempo. Quem divide o tempo conta proporcionalmente (ex.: 2,8 pessoas). |
| Fila / pendentes | O que vence no mês + o que sobrou dos meses anteriores sem atender. |
| Prazo para atender | Dias que uma empresa tem para receber os documentos depois de vencer (padrão 60). |
| Chefia | Função que lidera pessoas; aparece à parte no Headcount e no organograma. |
| Simulação | Pessoas a mais/menos só para testar; não altera o cadastro. |
| Porte | Tamanho/complexidade do cliente (P/M/G); o peso multiplica o esforço de cada cliente. |
| Ramp-up | Produção reduzida de quem acabou de entrar (50% no 1º mês, 80% no 2º, depois 100%). |
| Custo mensal | Salário + encargos de uma pessoa da função, por mês; base do impacto em R$. |

---

## Apêndice técnico

- **Aplicação**: Vue 3 + Vite (Pinia para o estado, vue-router em modo hash, Tailwind v4, Chart.js nos gráficos, SheetJS na importação de planilhas). O código fica em `web/`. Publicada na Vercel a partir do branch `main` do GitHub (https://github.com/joaojefferson-hash/Dimensionamento_Chabra): a Vercel roda `cd web && npm run build` e publica `web/dist`. Um `git push` publica.
- **Motor de cálculo**: `js/calculo.js` — funções puras, sem tela e sem banco, copiadas para `web/src/engine/calculo.js` pelo script `sync-engine` antes de cada `npm run dev` e `npm run build`. O modelo está documentado em `docs/MODELO-DE-CALCULO.md` e coberto por 84 testes automatizados (`cd web && npm test`).
- **Dados e login**: Supabase (projeto `wdlxpbusyuieftnxemot`). Login por e-mail/senha; cadastro público desligado. Tabelas: `unidades`, `unidade_mes` (clientes ativos e atendidas por ano/mês), `demanda_mensal` (vencimentos por ano/mês/condição/porte), `clientes_porte`, `colaboradores`, `colaborador_unidades`, `funcoes`, `portes`, `parametros` (linha única), `documentos` (catálogo oculto), `historico` e `sincronizacao_sst`. Papéis em `app_metadata.papel`; escrita protegida por RLS (`public.pode_editar()`); `importar_backup` só para administrador. Migrações em `supabase/migrations/0001…0030`.
- **Funções no servidor** (Edge Functions): `usuarios` (listar, criar, editar, redefinir senha, definir papel, remover) e `sincronizar-sst` (lê a API de documentos da Chabra). As credenciais ficam como segredos da função e nunca chegam ao navegador.
- **Histórico**: gatilhos `registrar_historico` em todas as tabelas de cadastro (security definer; escrita fora da API).
- **Rodar localmente**: `cd web && npm install && npm run dev` (abre em http://localhost:5173). Detalhes da arquitetura do front em `web/README.md`.
- **Legado**: a raiz do repositório ainda guarda a primeira versão do programa (`index.html`, `style.css`, `js/app.js`, `js/views/…`), que **não é publicada**. Dali, só `js/calculo.js` continua em uso, como fonte do motor de cálculo.
