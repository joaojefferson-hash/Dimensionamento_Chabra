# Chabra Dimensiona — Manual do programa

> Dimensionamento de quadro para a consultoria de Segurança e Saúde do Trabalho (SST) da Chabra.
> Endereço: https://dimensionamento-chabra.vercel.app · Acesso com e-mail e senha fornecidos pelo administrador.

Este documento descreve o programa inteiro: para que serve, quem acessa o quê, cada tela, como as contas são feitas e o que fazer no dia a dia. A parte técnica (código, banco, publicação) está no final.

---

## 1. Para que serve

O Chabra Dimensiona responde a três perguntas, com a equipe que a Chabra tem hoje:

1. **Quanto a equipe produz?** Cada colaborador declara o seu ritmo por dia (inspeções, relatórios ou empresas finalizadas). O programa transforma isso em produção por mês, unidade por unidade.
2. **Quanto trabalho existe?** Em cada unidade, mês a mês, quantos clientes têm documentos vencendo naquele mês — separados em **Mensal** e **Exclusiva TST**.
3. **A equipe dá conta? Quantas pessoas faltam ou sobram?** As programações comparam produção e demanda e dizem, em frases simples e com sinais verde / amarelo / vermelho, se cada unidade dá conta, está no limite ou precisa contratar — e quantas pessoas. A **Fila de atendimento** mostra o acumulado (backlog) e quantas pessoas contratar para zerá-lo dentro do prazo.

Tudo fica na nuvem, compartilhado pela equipe. Cada alteração de cadastro é registrada no **Histórico** (quem, quando, o que mudou).

---

## 2. Acesso e papéis

O administrador cria os usuários (nome, sobrenome, e-mail, senha inicial) e escolhe o papel de cada um na tela **Usuários**. O papel vale no próximo login da pessoa.

| Papel | Vê | Altera |
|---|---|---|
| **Administrador** | tudo | tudo; gerencia usuários; exporta/importa backup |
| **Supervisão** | Cadastros (Unidades, Empresas por Unidade, Colaboradores, Funções, Calendário) e Histórico | os cadastros |
| **Leitura** (diretoria, gerência, RH) | tudo: programações, fila, cadastros, histórico | nada |

No acesso de **Leitura**, os formulários e botões que gravam ficam desligados e um aviso aparece no topo; continuam funcionando o período, o ano, os filtros, a alternância Cadastro/Organograma, a impressão e a simulação "E se…?" (tudo isso fica só no navegador de quem usa).

A proteção não é só visual: o banco de dados recusa gravações de quem não pode editar.

Qualquer usuário troca a própria senha em **Senha** (rodapé do menu). Não há "esqueci a senha": o administrador redefine na tela Usuários.

---

## 3. O menu

| Seção | Tela | Para quê |
|---|---|---|
| Dimensionamento | **Programação Anual** | Um cartão por unidade (e o total): a equipe dá conta do ano/período? Quantas pessoas faltam ou sobram? |
| Dimensionamento | **Programação Mensal** | Mês a mês, técnicos e administrativos em grades separadas: consegue × precisa e quantas pessoas faltam/sobram em cada mês. |
| Dimensionamento | **Fila de atendimento** | O acumulado (backlog) hoje e sua evolução; quantas pessoas contratar para zerar dentro do prazo. Visão para a diretoria. |
| Cadastros | **Unidades** | As unidades/filiais. |
| Cadastros | **Empresas por Unidade** | Por unidade e mês: clientes ativos (informativo), Mensal e Exclusiva TST com documentos vencidos. |
| Cadastros | **Colaboradores** | A equipe, com função, ritmo por dia e unidades onde atua. Modo **Organograma**. |
| Cadastros | **Funções** | As funções (técnico, administrativo, supervisões, gerência), o que cada uma entrega e a hierarquia de chefia. |
| Cadastros | **Calendário** | Dias úteis de cada mês. |
| Acompanhamento | **Histórico** | Tudo o que mudou nos cadastros: quem, quando, antes/depois. |
| Administração | **Usuários** | Só admin: acessos, papéis, senhas e backup. |

Configurações que ficam no **seu navegador** (não afetam os outros): ano selecionado, período (de/até), mês atual da fila, unidade escolhida, filtros, modo da tela Colaboradores, orientação de impressão e a simulação.

Configurações **compartilhadas** (valem para toda a equipe, gravadas no banco): dias úteis, folga para imprevistos e prazo para atender.

---

## 4. Cadastros

### 4.1 Unidades

Nome de cada unidade/filial. A tela mostra a média mensal de clientes do ano selecionado. Excluir uma unidade apaga também os números por mês dela e a alocação dos colaboradores nela.

### 4.2 Empresas por Unidade

A base da demanda. Para cada unidade há três linhas por mês (janeiro a dezembro do **ano selecionado**):

- **Clientes ativos** — total de clientes da unidade no mês. **Só informativo** (histórico da carteira); não entra em nenhuma conta.
- **Mensal** — clientes com contrato mensal cujos documentos vencem naquele mês.
- **Exclusiva TST** — clientes na condição Exclusiva TST cujos documentos vencem naquele mês.
- **Total** = Mensal + Exclusiva TST (é o que a programação usa).

Cada cliente do Total precisa, naquele mês, de **uma inspeção e um relatório** (técnicos) e **uma finalização** (administrativos).

Como usar: digite o número em cada mês; célula vazia conta como zero; tudo salva automaticamente. O seletor **Mostrar** filtra por condição; o seletor **Ano** troca o ano (os números são por ano; dá para preencher 2027 sem mexer em 2026). "limpar 2026" apaga todos os números daquela unidade no ano. À direita, **Acumulado até [mês atual]** (soma de janeiro até o mês atual: o que venceu e ainda está em aberto + o que vence neste mês — é a "Fila hoje" da Fila de atendimento; o mês atual é o escolhido lá), **Total do ano** (soma dos 12 meses) e **Média** mensal; no rodapé, as somas de todas as unidades.

> Preencha em cada mês **só os documentos que vencem naquele mês** — nos meses que já passaram, os que venceram ali e **ainda estão em aberto**. Não precisa somar o que veio de meses anteriores: o sistema acumula isso sozinho na Fila de atendimento (ver 6.3).

### 4.3 Funções

Cada função diz o que a pessoa entrega:

- **Técnico** — faz inspeções e relatórios; entra na programação como técnico.
- **Administrativo** — finaliza empresas; entra como administrativo.
- **Sem produção** — não tem ritmo diário e fica fora das contas (supervisores, gerência).

Uma função pode ser **chefia de equipe**. Nesse caso informa-se **quem coordena** (toda a equipe / só os técnicos / só os administrativos) e **para quem responde** (outra chefia; vazio = topo). Isso monta o organograma e a linha "Chefia:" das programações. Hoje: Gerente de Segurança do Trabalho (topo, coordena todos) → Supervisor Geral (coordena todos) → Supervisor ADM (só administrativos); Supervisor TST Externo (só técnicos) responde ao Gerente.

Uma função em uso não pode ser excluída; a ordem da lista (▲▼) é a ordem de exibição.

### 4.4 Colaboradores

Para cada pessoa: nome, função e o **ritmo por dia**, que é dela — não há fórmula automática:

- Técnico: quantas **inspeções por dia** e quantos **relatórios por dia**.
- Administrativo: quantas **empresas finalizadas por dia**.
- Sem produção: não há ritmo; se for chefia, só se marcam as unidades que ela lidera.

**Unidades onde atua**: marque as unidades e divida o tempo em percentuais (a soma pode ficar abaixo de 100% — o resto não entra na programação — mas não acima). Quem divide o tempo conta proporcionalmente em cada unidade.

Lista com busca, filtro por função/unidade/"só chefia" e colunas Unidades e Tempo. Pessoas sem unidade aparecem com aviso e não entram na programação.

**Modo Organograma** (alternância no topo): números da equipe, barras de pessoas por unidade e a árvore de chefias — cada pessoa fica embaixo da chefia mais próxima que coordena o grupo dela na unidade; "Sem chefia definida" e "Sem unidade" ficam à parte. Clicar num nome abre a edição. Botão **Imprimir** (ou salvar em PDF) com escolha da folha (automática / retrato / paisagem).

### 4.5 Calendário

Dias úteis de cada mês (padrão 2026 = dias de semana menos feriados nacionais; botão para restaurar). É o que transforma ritmo por dia em produção por mês. O calendário é único, vale para todos os anos.

---

## 5. Como as contas são feitas

Linguagem da tela: nunca "capacidade", "fator" ou "gap" — sempre frases prontas ("A equipe consegue até 141 inspeções por mês; a carteira precisa de 55", "Faltam aproximadamente 2 técnicos…") e sinais de cor.

### 5.1 Produção da equipe

```
produção de uma pessoa no mês = ritmo por dia × dias úteis do mês × % do tempo na unidade
produção da equipe (consegue)  = soma das pessoas × (1 − folga para imprevistos)
```

- **Folga para imprevistos** (barra das programações; padrão 15%): parte do tempo reservada a faltas, retrabalho e urgências. Com 15%, conta-se que cada pessoa entrega 85% do que declarou.
- Técnicos têm duas entregas (inspeções e relatórios); a situação deles é a pior das duas. O que limita hoje são os relatórios (2 inspeções e 1 relatório por dia).

### 5.2 Demanda

```
precisa (unidade, mês) = clientes Mensal + Exclusiva TST lançados no mês
```

Cada cliente exige uma inspeção, um relatório e uma finalização naquele mês.

### 5.3 Situação e pessoas

- **Sobra** = consegue − precisa. **Dá conta** (verde) se sobra ≥ 10% do que consegue; **No limite** (amarelo) se sobra positiva mas menor que 10%; **Precisa contratar** (vermelho) se negativa.
- **Faltam N pessoas** = quanto falta ÷ produção de uma pessoa inteira no mês (arredondado para cima). **Sobram N** = idem, para baixo.
- No total "Todas as unidades", faltas e sobras são **somadas por unidade**: folga numa unidade não cobre falta em outra (a equipe não se desloca). Por isso o total pode "conseguir" mais do que precisa e ainda assim pedir contratação.
- Os números de cada mês são **sempre em relação à equipe de hoje** e não somam entre si: contratar o maior valor mensal cobre todos os meses. A Programação Mensal diz isso em frase: "Contratando 2 administrativos a partir de setembro, nenhum mês do ano fica descoberto".

### 5.4 Simulação "E se…?"

Card nas programações e na fila. Cada linha: unidade, grupo, pessoas (+ contratar / − desligar), **a partir de** um mês **até** outro (padrão dezembro — quem entra em setembro conta em outubro, novembro e dezembro) e ritmo por dia (sugerido pela média do grupo na unidade). Tudo recalcula na hora; as contagens mostram "(+2 simulados)". Fica só no navegador; não altera o cadastro nem o backup. Um desligamento maior que a equipe leva o grupo a zero, sem ficar negativo.

---

## 6. As telas de dimensionamento

### 6.1 Programação Anual

Barra: ano, período (de/até ou ano completo), folga. Um cartão "Todas as unidades" e um cartão por unidade, um embaixo do outro, cada um com a linha **Chefia:** (quem lidera a unidade), a demanda média por mês e dois quadros — Técnicos e Administrativos — com as frases "consegue × precisa" por entrega, o sinal de situação e a recomendação ("Faltam aproximadamente N…", "dão conta com folga — sobra o equivalente a N…"). Avisos no fim: pessoas sem unidade, tempo parcial, unidades sem gente.

### 6.2 Programação Mensal

Sempre os 12 meses do ano selecionado (barra: ano, unidade, folga). Uma grade para Técnicos e outra para Administrativos: por mês, dias úteis, clientes, equipe, consegue × precisa por entrega, **Faltam / sobram** e situação; rodapé com o ano. Abaixo, a frase do ano e a leitura mês a mês. Com "Todas as unidades", uma grade unidade × mês com os sinais do grupo e faltam/sobram por unidade — clique numa unidade para ver o detalhe.

### 6.3 Fila de atendimento

Barra: ano, período, **mês atual**, unidade, **prazo para atender** (dias; padrão 60; compartilhado) e folga.

Como a fila é montada (por unidade e grupo), do primeiro mês com número em diante:

- **Pendentes** do mês = o que sobrou do mês anterior + o número lançado (o que vence no mês). Vale para todos os meses.
- **Meses passados**: o número lançado já é o que venceu ali e **ainda está em aberto** — a equipe já trabalhou de verdade e o que sobrou é esse número. Por isso o programa não desconta a produção da equipe de novo: tudo passa para o mês seguinte e vai somando até hoje.
- **Mês atual e seguintes**: **Atendidas** = o menor entre os pendentes e o que a equipe consegue no mês; **Ficam pendentes** = pendentes − atendidas (nunca negativo), que passa para o mês seguinte.

Mudar o número de um mês recalcula todos os seguintes. Exemplo: janeiro 25 e fevereiro 28 em aberto → em março já há 53 acumulados mais o que vence em março. A **Fila hoje** é o acumulado do mês atual (o que vence no mês + tudo o que ficou em aberto dos anteriores); logo abaixo do número aparece "Desse total, X vieram de meses anteriores ainda não atendidos".

Para cada grupo:

- Indicadores de hoje: **Produção por dia** (por entrega, com o gargalo), **Fila hoje**, **Vencem até o prazo**, **Contratar para cumprir o prazo** (pessoas a mais para zerar fila + o que vence dentro do prazo) e **Fila em dezembro** sem contratar.
- Indicadores do período: **A atender** (pendentes + o que vence, do mês atual em diante), **Equipe consegue**, **Contratar até [mês final]**, **Fila no fim**.
- Frases prontas com tudo isso; gráfico da fila no fim de cada mês; tabela mês a mês (Vencem no mês · Pendentes · Consegue · Atendidas · Ficam pendentes · Situação) e, com todas as unidades, a grade por unidade (equipe, fila hoje, contratar em N dias, contratar até o fim do período e pendentes no fim de cada mês).
- Situação do mês: **dá conta** = zerado no fim do mês; **no limite** = fica menos de um mês de trabalho; **precisa contratar** = fica mais de um mês de trabalho (prazo em risco).

Empresas novas: cada uma tem 60 dias para receber os documentos; é só somá-la ao número do mês em que esse prazo vence.

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
3. Conferir na **Programação Mensal** onde faltam pessoas e na **Fila de atendimento** o acumulado e o prazo.
4. Para a diretoria: Fila de atendimento (mês atual + prazo de 60 dias), com a simulação "E se…?" para testar contratações antes de decidir.
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
| Pessoa inteira | Uma pessoa 100% do tempo. Quem divide o tempo conta proporcionalmente (ex.: 2,8 pessoas). |
| Fila / pendentes | O que vence no mês + o que sobrou dos meses anteriores sem atender. |
| Prazo para atender | Dias que uma empresa tem para receber os documentos depois de vencer (padrão 60). |
| Chefia | Função que lidera pessoas; aparece nos cartões e no organograma. |
| Simulação | Pessoas a mais/menos só para testar; não altera o cadastro. |

---

## Apêndice técnico

- **Aplicação**: HTML/CSS/JavaScript puro, sem framework nem build. Publicada na Vercel a partir do branch `main` do GitHub (https://github.com/joaojefferson-hash/Dimensionamento_Chabra). Um `git push` publica.
- **Dados e login**: Supabase (projeto `wdlxpbusyuieftnxemot`). Login por e-mail/senha; cadastro público desligado. Tabelas: `unidades`, `unidade_empresas_mes` (por ano/mês), `colaboradores`, `colaborador_unidades`, `funcoes`, `documentos` (catálogo oculto), `parametros` (linha única), `historico`. Papéis em `app_metadata.papel`; escrita protegida por RLS (`public.pode_editar()`); `importar_backup` só para admin.
- **Gestão de usuários**: Edge Function `usuarios` (listar, criar, editar, redefinir senha, definir papel, remover), chamada com o JWT do administrador; a chave secreta fica só no servidor.
- **Histórico**: gatilhos `registrar_historico` em todas as tabelas de cadastro (security definer; escrita fora da API).
- **Código**: `index.html`, `style.css`, `js/config.js` (URL e chave pública), `js/auth.js`, `js/store.js` (cache + Supabase + backup), `js/calculo.js` (motor puro: `calcular` e `fila`), `js/programacao.js` (barra, simulação, frases), `js/organograma.js`, `js/views/*.js` (uma por tela), `js/app.js` (navegação, papéis, modo leitura). Migrações em `supabase/migrations/0001…0021`. Detalhes de instalação e do modelo de dados no `README.md`.
- **Rodar localmente**: abrir `index.html` com o Live Server do VS Code (ou `python -m http.server`).
