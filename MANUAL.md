# Chabra Dimensiona — Manual do programa

> Dimensionamento de quadro para a consultoria de Segurança e Saúde do Trabalho (SST) da Chabra.
> Endereço: https://dimensionamento-chabra.vercel.app · Acesso com e-mail e senha fornecidos pelo administrador.

Este documento descreve o programa inteiro: para que serve, quem acessa o quê, cada tela, como as contas são feitas e o que fazer no dia a dia. A parte técnica (código, banco, publicação) está no final.

---

## 1. Para que serve

O Chabra Dimensiona responde a três perguntas, com a equipe que a Chabra tem hoje:

1. **Quanto a equipe produz?** Cada colaborador declara o seu ritmo por dia (inspeções, relatórios ou empresas finalizadas). O programa transforma isso em produção por mês, unidade por unidade.
2. **Quanto trabalho existe?** Em cada unidade, mês a mês, quantos clientes têm documentos vencendo naquele mês — separados em **Mensal** e **Exclusiva TST**.
3. **A equipe dá conta? Qual o quadro ideal? Quanto fica pendente? Quantos contratar, e em qual área?** A tela **Dimensionamento** responde mês a mês, com sinais verde / amarelo / vermelho: o que já passou diz "deveria ter contratado…"; daqui para a frente, "contratar…"; e o pendente acumulado, com quantas pessoas a mais zeram tudo dentro do prazo.

Tudo fica na nuvem, compartilhado pela equipe. Cada alteração de cadastro é registrada no **Histórico** (quem, quando, o que mudou).

---

## 2. Acesso e papéis

O administrador cria os usuários (nome, sobrenome, e-mail, senha inicial) e escolhe o papel de cada um na tela **Usuários**. O papel vale no próximo login da pessoa.

| Papel | Vê | Altera |
|---|---|---|
| **Administrador** | tudo | tudo; gerencia usuários; exporta/importa backup |
| **Supervisão** | Cadastros (Unidades, Empresas por Unidade, Colaboradores, Funções, Calendário) e Histórico | os cadastros |
| **Leitura** (diretoria, gerência, RH) | tudo: dimensionamento, cadastros, histórico | nada |

No acesso de **Leitura**, os formulários e botões que gravam ficam desligados e um aviso aparece no topo; continuam funcionando o ano, o mês atual, os filtros, a alternância Cadastro/Organograma, a impressão e a simulação "E se…?" (tudo isso fica só no navegador de quem usa).

A proteção não é só visual: o banco de dados recusa gravações de quem não pode editar.

Qualquer usuário troca a própria senha em **Senha** (rodapé do menu). Não há "esqueci a senha": o administrador redefine na tela Usuários.

---

## 3. O menu

| Seção | Tela | Para quê |
|---|---|---|
| Dimensionamento | **Dimensionamento** | A tela de resultado: pendentes hoje, equipe → quadro ideal, mês a mês (deveria ter contratado? contratar?), por unidade, "E se…?". |
| Dimensionamento | **Dashboard** | Os mesmos números em gráficos: pendentes mês a mês, vencem × equipe consegue, equipe hoje × ideal, por unidade, R$. |
| Cadastros | **Unidades** | As unidades/filiais. |
| Cadastros | **Empresas por Unidade** | Por unidade e mês: clientes ativos (informativo), Mensal e Exclusiva TST com documentos vencidos. |
| Cadastros | **Colaboradores** | A equipe, com função, ritmo por dia e unidades onde atua. Modo **Organograma**. |
| Cadastros | **Funções** | As funções (técnico, administrativo, supervisões, gerência), o que cada uma entrega e a hierarquia de chefia. |
| Cadastros | **Calendário** | Dias úteis de cada mês; folga para imprevistos e prazo para atender. |
| Acompanhamento | **Histórico** | Tudo o que mudou nos cadastros: quem, quando, antes/depois. |
| Administração | **Usuários** | Só admin: acessos, papéis, senhas e backup. |

Configurações que ficam no **seu navegador** (não afetam os outros): ano selecionado, mês atual, unidade escolhida, filtros, modo da tela Colaboradores, orientação de impressão e a simulação.

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
- **Total** = Mensal + Exclusiva TST (é o que o Dimensionamento usa, com cada cliente valendo o peso do seu porte).

**Porte.** O seletor **Porte** (Pequeno · Médio · Grande · Todos) define o que você está digitando: escolha um porte e lance os números daquele porte; troque e lance os de outro. Em **Todos**, as células mostram a soma dos portes (só leitura; passe o mouse para ver "P 20 · M 3 · G 2") e a linha Total mostra entre parênteses o **esforço equivalente** (cada cliente × o peso do porte: P 1,0 · M 1,5 · G 2,0, editáveis no Calendário). Ex.: 75 pequenos + 2 grandes = 77 clientes, esforço 79.

Cada cliente do Total precisa, naquele mês, de **uma inspeção e um relatório** (técnicos) e **uma finalização** (administrativos).

**Importar do SGG.** Em vez de digitar, exporte do SGG o relatório *Vencimento(s) de PGR(s)* (.xlsx) e use o card *Importar do SGG* no topo da tela. O sistema reconhece as colunas do relatório: **Região** (unidade), **Data Validade** (o mês), **Empresa** e **Código Empresa** (cada estabelecimento conta uma vez por mês, mesmo com vários documentos), **Situação** (por padrão entram os "Vencido"; renovados/em dia ficam de fora) e **Informações adicionais da Empresa** ("Mensal…" → Mensal; texto com "Exclusiva"/"TST" → Exclusiva TST). Porte: o relatório não traz; abra **"Ver as N empresas do arquivo"** e escolha o porte de cada empresa na coluna Porte — a prévia muda na hora (o mês passa a mostrar o esforço equivalente entre parênteses) e a escolha **fica guardada pelo Código Empresa**: na próxima importação as empresas já vêm classificadas, só as novas precisam de atenção. Empresas sem escolha entram com o porte padrão do seletor (Pequeno). A lista também mostra, para cada empresa, o vencimento, o mês, a condição, a situação e se entra ou não (e por quê). Confira o **ano** (o relatório de vencidos costuma trazer o ano anterior) e a prévia por unidade × mês, com o número que está hoje ("era N"); unidades que não casarem com o cadastro aparecem em vermelho. Só ao clicar em **Importar** os números de Mensal e Exclusiva TST daquele ano, nas unidades presentes no arquivo, são substituídos (Clientes ativos não muda). Fica registrado no Histórico.

**O que ficou em aberto no ano anterior passa para janeiro.** Se 2025 tem 65 clientes vencidos e ainda em aberto, o Dimensionamento de 2026 começa janeiro com esses 65 — o cartão "Pendentes hoje" mostra "(inclui 65 de 2025)". Por isso vale importar o relatório de vencidos do ano anterior.

Como usar: digite o número em cada mês; célula vazia conta como zero; tudo salva automaticamente. O seletor **Mostrar** filtra por condição; o seletor **Ano** troca o ano (os números são por ano; dá para preencher 2027 sem mexer em 2026). "limpar 2026" apaga todos os números daquela unidade no ano. À direita, **Acumulado até [mês atual]** (soma de janeiro até o mês atual: o que venceu e ainda está em aberto + o que vence neste mês — são os "Pendentes hoje" do Dimensionamento; o mês atual é o escolhido lá), **Total do ano** (soma dos 12 meses) e **Média** mensal; no rodapé, as somas de todas as unidades.

> Preencha em cada mês **só os documentos que vencem naquele mês** — nos meses que já passaram, os que venceram ali e **ainda estão em aberto**. Não precisa somar o que veio de meses anteriores: o sistema acumula isso sozinho no Dimensionamento (ver 6.2).

### 4.3 Funções

Cada função diz o que a pessoa entrega:

- **Técnico** — faz inspeções e relatórios; entra na programação como técnico.
- **Administrativo** — finaliza empresas; entra como administrativo.
- **Sem produção** — não tem ritmo diário e fica fora das contas (supervisores, gerência).

Uma função pode ser **chefia de equipe**. Nesse caso informa-se **quem coordena** (toda a equipe / só os técnicos / só os administrativos) e **para quem responde** (outra chefia; vazio = topo). Isso monta o organograma e a linha "Chefia:" das programações. Hoje: Gerente de Segurança do Trabalho (topo, coordena todos) → Supervisor Geral (coordena todos) → Supervisor ADM (só administrativos); Supervisor TST Externo (só técnicos) responde ao Gerente.

**Custo mensal de uma pessoa** (R$, salário + encargos, em média): opcional. Com ele o Dimensionamento mostra quanto custa contratar quem falta e quanto custa a sobra. Vazio = sem valores em R$.

Uma função em uso não pode ser excluída; a ordem da lista (▲▼) é a ordem de exibição.

### 4.4 Colaboradores

Para cada pessoa: nome, função e o **ritmo por dia**, que é dela — não há fórmula automática:

- Técnico: quantas **inspeções por dia** e quantos **relatórios por dia**.
- Administrativo: quantas **empresas finalizadas por dia**.
- Sem produção: não há ritmo; se for chefia, só se marcam as unidades que ela lidera.

**Data de admissão** (opcional): a pessoa só conta a partir dela (o mês de entrada conta proporcional aos dias) e entra em **ramp-up** — produz menos nos primeiros meses de casa (padrão: 1º mês 50%, 2º mês 80%, depois 100%; a curva fica no Calendário). Sem data = veterano, 100% desde sempre. **Data de desligamento** (opcional): a partir dela a pessoa sai das contas; o cadastro fica para o histórico. Com as datas, o Dimensionamento passa a usar a equipe real de cada mês. **Custo mensal** (opcional): sobrepõe o custo médio da função.

**Unidades onde atua**: marque as unidades e divida o tempo em percentuais (a soma pode ficar abaixo de 100% — o resto não entra na programação — mas não acima). Quem divide o tempo conta proporcionalmente em cada unidade.

Lista com busca, filtro por função/unidade/"só chefia" e colunas Na equipe (desde mês/ano, "ramp-up 50%", "até dd/mm/aaaa (desligado)"), Unidades e Tempo. Pessoas sem unidade aparecem com aviso e não entram na programação.

**Modo Organograma** (alternância no topo): números da equipe, barras de pessoas por unidade e a árvore de chefias — cada pessoa fica embaixo da chefia mais próxima que coordena o grupo dela na unidade; "Sem chefia definida" e "Sem unidade" ficam à parte. Clicar num nome abre a edição. Botão **Imprimir** (ou salvar em PDF) com escolha da folha (automática / retrato / paisagem).

### 4.5 Calendário

Dias úteis de cada mês (padrão 2026 = dias de semana menos feriados nacionais; botão para restaurar). É o que transforma ritmo por dia em produção por mês. O calendário é único, vale para todos os anos.

Abaixo, os **parâmetros do dimensionamento**, compartilhados por todos: **folga para imprevistos** (%; padrão 15), **prazo para atender** (dias; padrão 60) e o **ramp-up** de quem é contratado (1º, 2º e 3º mês de casa, em %; padrão 50 / 80 / 100 — vale para quem tem data de admissão e para as contratações simuladas). Depois, o **porte dos clientes**: o peso de Pequeno, Médio e Grande (padrão 1,0 / 1,5 / 2,0).

---

## 5. Como as contas são feitas

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

- **Sobra** = consegue − precisa. **Dá conta** (verde) se sobra ≥ 10% do que consegue; **No limite** (amarelo) se sobra positiva mas menor que 10%; **Precisa contratar** (vermelho) se negativa.
- **Faltam N pessoas** = quanto falta ÷ produção de uma pessoa inteira no mês (arredondado para cima). **Sobram N** = idem, para baixo.
- No total "Todas as unidades", faltas e sobras são **somadas por unidade**: folga numa unidade não cobre falta em outra (a equipe não se desloca). Por isso o total pode "conseguir" mais do que precisa e ainda assim pedir contratação.
- **Quadro ideal** = o que precisa no mês ÷ o que uma pessoa inteira faz no mês (com a folga), arredondado para cima. Os números de cada mês são **sempre em relação à equipe de hoje** e não somam entre si: o maior quadro ideal do ano cobre todos os meses ("Para não faltar em nenhum mês: 5 técnicos e 5 administrativos").
- **Pendente** = o que vence no mês + o que sobrou do mês anterior − o que a equipe atende (só do mês atual em diante; nos meses passados o número lançado já é o que ficou em aberto). **Para zerar em N dias** = pessoas a mais para atender o pendente de hoje e o que vence dentro do prazo.
- **Impacto financeiro** (só com o custo mensal cadastrado nas Funções): custo de uma pessoa = o do colaborador ou, se vazio, o da função (média da equipe da unidade). **Contratar ≈ R$** = pessoas que faltam × custo, por mês; **sobra ≈ R$** = pessoas inteiras que sobram × custo; no rodapé, a soma do ano. Aparece na conclusão de cada mês, no cartão de hoje ("+9 técnicos ≈ R$ 36.000/mês") e no rodapé.

### 5.4 Simulação "E se…?"

Bloco fechado no fim do Dimensionamento. Cada linha: unidade, grupo, pessoas (+ contratar / − desligar), **a partir de** um mês **até** outro (padrão dezembro — quem entra em setembro conta em outubro, novembro e dezembro) e ritmo por dia (sugerido pela média do grupo na unidade). Tudo recalcula na hora; as contagens mostram "(+2 simulados)". Fica só no navegador; não altera o cadastro nem o backup. Um desligamento maior que a equipe leva o grupo a zero, sem ficar negativo.

---

## 6. Dimensionamento (a tela de resultado)

Uma tela só. Barra: **ano**, **mês atual** (separa o que já passou do plano; fica no seu navegador; padrão = mês do calendário) e **unidade** (ou todas). Folga, prazo e dias úteis ficam no Calendário.

### 6.1 Hoje

Três números para o mês atual:

- **Pendentes hoje** — empresas em aberto: o que vence no mês + tudo o que ficou de meses anteriores ("645 ficaram de meses anteriores + 131 que vencem em setembro").
- **Técnicos** e **Administrativos** — "11 hoje → 11 ideal em setembro": a equipe de hoje e o quadro ideal do mês; "Para zerar o pendente em 60 dias: +18 técnicos"; e quanto a equipe produz por dia. Em "Todas as unidades" pode aparecer "faltam 2 onde precisa · sobram 3 em outras unidades": cada unidade tem a sua equipe, quem sobra numa não atende a fila de outra.

### 6.2 Mês a mês

Uma tabela com os 12 meses do ano selecionado:

| Coluna | O que é |
|---|---|
| Vencem | Clientes Mensal + Exclusiva TST que vencem no mês (Empresas por Unidade). |
| Pendente no fim do mês | O que fica em aberto: o que veio de antes + o que vence − o que a equipe atende. Nos meses passados o número lançado já é o que ficou em aberto, então só soma. |
| Técnicos / Administrativos (hoje → ideal) | Equipe de hoje → quadro ideal do mês (pessoas inteiras para dar conta do que vence). Vermelho quando falta gente. Passe o mouse para ver inspeções, relatórios e dias úteis. |
| Conclusão | Meses passados: "Deveria ter contratado 1 técnico e 2 administrativos" ou "Não precisava contratar". Mês atual e seguintes: "Contratar…" ou "Dá conta" (· no limite). Em "Todas as unidades", diz em qual unidade. |

Linha do rodapé: total que vence no ano, pendente em dezembro sem contratar, o maior quadro ideal do ano e "Para não faltar em nenhum mês: N técnicos e N administrativos". A linha do mês atual fica em negrito; os meses passados, esmaecidos.

Como o pendente é montado, do primeiro mês em diante: pendentes = sobra do mês anterior + o que vence — e janeiro começa com o que ficou em aberto no ano anterior (o pendente de dezembro do ano anterior; se aquele ano já terminou, tudo o que foi lançado nele). Nos **meses passados**, o número lançado é o que venceu e **ainda está em aberto** — a equipe já trabalhou de verdade e o que sobrou é esse número; por isso nada é descontado e tudo passa adiante. Do **mês atual em diante**, a equipe atende o que consegue (o que limita: nos técnicos, a menor entre inspeções e relatórios) e o resto passa para o mês seguinte. Mudar o número de um mês recalcula os seguintes.

### 6.3 Por unidade

Com "Todas as unidades": uma linha por unidade com os pendentes de hoje, técnicos e administrativos (hoje → ideal, e "+N para zerar em 60 dias") e a conclusão do mês atual. Clique numa unidade para ver o mês a mês dela.

### 6.4 "E se…?"

Fica fechado no fim da tela; abre num clique. Cada linha: unidade, grupo, pessoas (+ contratar / − desligar), a partir de um mês até outro (padrão dezembro) e ritmo por dia. Tudo recalcula na hora — inclusive os meses passados, para testar "se eu tivesse contratado em fevereiro". Fica só no navegador; quando há simulação ativa, o bloco abre sozinho e mostra o que está sendo simulado.

No fim da tela aparecem avisos de cadastro (pessoas sem unidade, tempo parcial, unidades sem gente).

### 6.5 Dashboard

A mesma barra (ano · mês atual · unidade) e os mesmos números do Dimensionamento, em gráficos, **sempre de uma unidade por vez** (sem o total de todas, para não confundir) — passe o mouse para ver os valores:

- **Pendentes no fim de cada mês** — barras claras nos meses passados (o lançado vai somando), escura no mês atual, laranja no plano.
- **Vencem no mês × o que a equipe consegue** — barras com o que vence (cada cliente valendo o peso do porte) e linhas com quanto técnicos e administrativos dão conta.
- **Equipe hoje × quadro ideal** — um gráfico por área; o ideal fica vermelho no mês em que falta gente.
- **Impacto em R$** (quando há custo nas Funções): contratar quem falta × sobra paga sem produção, mês a mês.

---

## 7. Histórico

Lista, por dia, tudo o que mudou nos cadastros: quem fez, quando e o quê ("Alterou a unidade Teresópolis — clientes Mensal: 56 → 75", "Alocou Fulano em Petrópolis com 100% do tempo", "Cadastrou a função Supervisor ADM…"). Filtro por texto, "Carregar mais", "Atualizar". Uma importação de backup vira um único evento. Registrado pelo próprio banco (gatilhos), não dá para editar.

---

## 8. Backup

Tela Usuários (admin) → **Backup dos dados**: **Exportar JSON** baixa tudo (funções, unidades com os números por ano/mês, colaboradores com alocações, parâmetros). **Importar JSON** substitui todos os dados atuais, para toda a equipe — use só para restaurar. Backups de versões antigas do programa continuam importáveis (o programa converte).

---

## 9. Rotina sugerida

1. **Todo mês**: em Empresas por Unidade, lançar em cada unidade os clientes ativos e quantos Mensal e Exclusiva TST **vencem no mês** (só o do mês; o acumulado o programa calcula) — e, se souber, o que vence nos próximos meses.
2. Manter Colaboradores em dia: quem entrou/saiu, ritmo por dia, unidades e percentuais.
3. Conferir no **Dimensionamento**: pendentes hoje, quadro ideal por área, quantos contratar para zerar no prazo e em qual unidade.
4. Para a diretoria: a mesma tela, com a simulação "E se…?" para testar contratações antes de decidir.
5. De tempos em tempos, exportar um backup.

---

## 10. Glossário

| Termo | Significado |
|---|---|
| Ritmo por dia | O que uma pessoa declara fazer num dia normal (inspeções, relatórios ou empresas finalizadas). |
| Dias úteis | Dias de trabalho do mês (Calendário). |
| Folga para imprevistos | % do tempo reservado; o programa conta que cada pessoa entrega (100 − folga)% do ritmo. |
| Consegue | Quanto a equipe entrega no mês, já com a folga. |
| Precisa | Clientes Mensal + Exclusiva TST que vencem no mês (cada um = 1 inspeção, 1 relatório, 1 finalização). |
| Faltam / sobram | Pessoas inteiras a mais ou a menos para o mês, em relação à equipe de hoje. |
| Quadro ideal | Pessoas inteiras necessárias para dar conta do que vence no mês (o que precisa ÷ o que uma pessoa inteira faz no mês, arredondado para cima). |
| Pessoa inteira | Uma pessoa 100% do tempo. Quem divide o tempo conta proporcionalmente (ex.: 2,8 pessoas). |
| Fila / pendentes | O que vence no mês + o que sobrou dos meses anteriores sem atender. |
| Prazo para atender | Dias que uma empresa tem para receber os documentos depois de vencer (padrão 60). |
| Chefia | Função que lidera pessoas; aparece no Dimensionamento e no organograma. |
| Simulação | Pessoas a mais/menos só para testar; não altera o cadastro. |
| Porte | Tamanho/complexidade do cliente (P/M/G); o peso multiplica o esforço de cada cliente. |
| Ramp-up | Produção reduzida de quem acabou de entrar (50% no 1º mês, 80% no 2º, depois 100%). |
| Custo mensal | Salário + encargos de uma pessoa da função, por mês; base do impacto em R$. |

---

## Apêndice técnico

- **Aplicação**: HTML/CSS/JavaScript puro, sem framework nem build. Publicada na Vercel a partir do branch `main` do GitHub (https://github.com/joaojefferson-hash/Dimensionamento_Chabra). Um `git push` publica.
- **Dados e login**: Supabase (projeto `wdlxpbusyuieftnxemot`). Login por e-mail/senha; cadastro público desligado. Tabelas: `unidades`, `unidade_empresas_mes` (por ano/mês), `colaboradores`, `colaborador_unidades`, `funcoes`, `documentos` (catálogo oculto), `parametros` (linha única), `historico`. Papéis em `app_metadata.papel`; escrita protegida por RLS (`public.pode_editar()`); `importar_backup` só para admin.
- **Gestão de usuários**: Edge Function `usuarios` (listar, criar, editar, redefinir senha, definir papel, remover), chamada com o JWT do administrador; a chave secreta fica só no servidor.
- **Histórico**: gatilhos `registrar_historico` em todas as tabelas de cadastro (security definer; escrita fora da API).
- **Código**: `index.html`, `style.css`, `js/config.js` (URL e chave pública), `js/auth.js`, `js/store.js` (cache + Supabase + backup), `js/calculo.js` (motor puro: `calcular` e `fila`), `js/programacao.js` (barra, simulação, frases), `js/organograma.js`, `js/views/*.js` (uma por tela), `js/app.js` (navegação, papéis, modo leitura). Migrações em `supabase/migrations/0001…0021`. Detalhes de instalação e do modelo de dados no `README.md`.
- **Rodar localmente**: abrir `index.html` com o Live Server do VS Code (ou `python -m http.server`).
