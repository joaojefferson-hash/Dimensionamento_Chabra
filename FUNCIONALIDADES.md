# Chabra Dimensiona — o que o programa faz

> Referência completa das funcionalidades do sistema de dimensionamento de quadro da consultoria de Segurança e Saúde do Trabalho (SST) da Chabra.
> Endereço: https://dimensionamento-chabra.vercel.app · Documentos relacionados: `MANUAL.md` (manual de uso, passo a passo) e `README.md` (notas técnicas).

---

## 1. Em uma frase

O programa compara, mês a mês e por unidade, **a carteira de clientes que vence** com **a capacidade da equipe**, e responde: o quadro é suficiente, quantas pessoas faltam ou sobram, quanto fica pendente, quanto custa a diferença e o que teria acontecido se as contratações tivessem sido feitas.

Três perguntas orientam todo o sistema:

1. **Quanto trabalho existe?** Clientes com documentos vencendo em cada mês, por unidade, condição e porte.
2. **Quanto a equipe entrega?** Produção declarada por pessoa, convertida em produção mensal pelos dias úteis, descontadas margem, período de adaptação e tempo parcial.
3. **O que falta?** Quadro ideal, contratações necessárias, pendências acumuladas e o impacto em reais.

---

## 2. O modelo de cálculo

```
produção de uma pessoa no mês = produção diária × dias úteis do mês × % do tempo na unidade
                                × presença no mês (admissão/desligamento, proporcional aos dias)
                                × período de adaptação (1º mês 50%, 2º 80%, depois 100%)

capacidade da equipe (mês)    = Σ produção das pessoas × (1 − margem para imprevistos)

demanda (unidade, mês)        = Σ clientes que vencem no mês × peso do porte   (P 1,0 · M 1,5 · G 2,0)

fila inicial (janeiro)        = fila do fim do ano anterior
fila final (mês)              = fila inicial + demanda do mês − atendidas
```

Regras que decorrem do modelo:

- **Cada cliente exige uma inspeção, um relatório e uma finalização** no mês. Técnicos respondem pelas duas primeiras; administrativos, pela terceira.
- **Técnicos têm duas entregas** (inspeções e relatórios) e a situação da área é a pior das duas — na prática, o relatório costuma ser o limite.
- **O porte multiplica a demanda**: um cliente grande equivale a dois pequenos.
- **A fila acumula**: o que não é atendido em um mês entra no seguinte, e o saldo de dezembro entra em janeiro do ano seguinte.
- **Alterar um lançamento recalcula daquele mês em diante**; os meses anteriores não mudam.
- **A equipe de uma unidade não atende a fila de outra**: faltas e sobras são apuradas por unidade.

Parâmetros configuráveis (tela Calendário, compartilhados por toda a equipe): dias úteis de cada mês, margem para imprevistos (padrão 15%), prazo de atendimento (padrão 60 dias), período de adaptação (padrão 50% / 80% / 100%) e peso de cada porte.

---

## 3. A tela de dimensionamento

### 3.1 Headcount (a tela de resultado)

Responde diretamente: **quantas pessoas para zerar os documentos vencidos acumulados até o mês escolhido?** Tudo se escolhe na barra do topo: ano, mês, unidade e o prazo de eliminação (1, 2, 3, 6 ou 12 meses). O prazo fica lembrado no navegador.

- **Cartões**: vencido acumulado até o mês (com a parcela herdada de anos anteriores), o que vence no mês, a equipe atual e quantas pessoas faltam para o prazo escolhido.
- **Equipe da unidade, pessoa por pessoa**: a lista de quem está alocado ali no mês, com a alocação, a presença (quem entrou ou saiu no meio do mês), a produção diária declarada e quanto cada um equivale em tempo integral — a conferência do número da equipe contra o cadastro. A chefia alocada na unidade aparece à parte, porque coordena e não entra no quadro.
- **Quadro necessário para o prazo escolhido**: uma linha só, a do prazo selecionado nos botões — o trabalho total (vencido + o que vence durante o período), o volume mensal, o quadro por área, o total, o déficit e o custo. Prazos que passam de dezembro usam a média do ano e são marcados como estimados.
- **Onde entra cada pessoa**: o mesmo cálculo por área, uma linha para cada. Inspeção e relatório são atividades do mesmo técnico, então aparecem juntas e contam como uma pessoa só — quando uma delas exige mais gente, é ela que define o quadro da área.
- **Há quanto tempo está vencido**: faixas de idade e a parcela fora do prazo.
- **Gráficos**: o quadro necessário em cada um dos cinco prazos, empilhado por área, com a equipe de hoje como linha de referência (o prazo escolhido em cor cheia); e a idade do vencido acumulado por faixa de 30 dias.

## 4. Cadastros

### 4.1 Unidades

Nome das unidades (filiais), média mensal de clientes do ano selecionado e número de colaboradores. Excluir uma unidade apaga os lançamentos mensais e a alocação de colaboradores nela.

### 4.2 Empresas por Unidade

A carteira, por unidade e mês, no ano selecionado. Linhas de cada unidade:

| Linha | Entra no cálculo | O que é |
|---|---|---|
| Clientes ativos | não | total de clientes da unidade no mês, apenas informativo |
| **Mensal** | sim | clientes com contrato mensal cujos documentos vencem no mês |
| **Exclusiva TST** | sim | clientes na condição Exclusiva TST |
| **Empresa sem avaliação** | sim | clientes ainda sem avaliação realizada |
| **Contratos novos** | sim | clientes de contratos firmados no mês |
| Total | — | soma das quatro condições, com a demanda equivalente entre parênteses |
| **Atendidas no mês** | sim | empresas efetivamente concluídas, por porte — é o que sai da fila |

Recursos da tela: seletor de **ano** (vale para a tabela e para a importação), filtro **Exibir** (todas ou uma linha por vez), seletor de **porte** (os lançamentos são feitos por porte; "Todos" exibe a soma, somente leitura), coluna **Acumulado até o mês atual**, totais e médias por unidade e no rodapé, e o botão para excluir os lançamentos do ano de uma unidade. Tudo é salvo automaticamente e registrado no Histórico.

**Importação do SGG.** Lê planilhas `.xlsx` ou `.csv`, reconhece as colunas pelos títulos (Região, Data Validade, Empresa, Código Empresa, Situação, Informações adicionais) e permite ajustar cada uma. Opções: unidade do cadastro (ou pela coluna do arquivo), condição (fixa ou lida da coluna), **mês de referência** para planilhas sem coluna de data, critério de contagem (cada cliente uma vez por mês ou cada linha), situações consideradas e porte (fixo, por faixa de funcionários ou escolhido empresa a empresa — a escolha fica guardada pelo código do cliente para as próximas importações). Apresenta prévia por unidade × mês, a lista das empresas do arquivo com o motivo de cada exclusão e o valor atual para comparação. A gravação substitui **apenas a condição selecionada**, no ano selecionado, nas unidades presentes no arquivo; Clientes ativos nunca são alterados.

### 4.3 Colaboradores

Dois modos, alternados no topo da tela:

**Cadastro** — nome, função, produção diária (inspeções e relatórios, ou empresas finalizadas), data de admissão, data de desligamento, custo mensal e unidades de atuação com percentual do tempo. A lista traz busca, filtros por função e unidade, e as colunas Produção diária, Vigência (desde quando, adaptação em curso, desligamento), Unidades e Alocação.

**Organograma** — indicadores da equipe, barras de colaboradores por unidade e a árvore de chefias, montada pela hierarquia das funções e pelas unidades de cada colaborador. Quem não tem chefia que coordene a sua área na unidade aparece em "Sem chefia definida"; quem não tem unidade, em "Sem unidade". Clicar em um nome abre a edição. Imprime somente o organograma, com escolha da folha (automática, retrato ou paisagem) e redução para caber na página.

### 4.4 Funções

Nome, tipo de produção (técnico, administrativo ou sem produção), chefia de equipe, equipe coordenada, subordinação hierárquica, custo mensal por colaborador e ordem de exibição. O custo alimenta os valores em R$ de todas as telas de dimensionamento; a hierarquia monta o organograma. Funções em uso não podem ser excluídas, e o sistema impede ciclos de subordinação.

### 4.5 Calendário e parâmetros

Dias úteis de cada mês (com restauração do padrão do ano), margem para imprevistos, prazo de atendimento, período de adaptação (1º, 2º e 3º mês) e peso de cada porte. Tudo é compartilhado e salvo ao alterar.

---

## 5. Acompanhamento e administração

### 5.1 Histórico

Registro automático de todas as alterações nos cadastros — autor, data, valor anterior e valor atual, em frases legíveis ("Lançou 3 clientes Empresa sem avaliação (pequeno) em janeiro/2026 de Teresópolis"). Filtro por texto ou autor e carregamento por página. É gravado pelo próprio banco de dados, não pela interface, e não pode ser editado.

### 5.2 Usuários (somente administrador)

Criação de usuários (nome, sobrenome, e-mail, senha inicial gerada pelo sistema), definição de perfil, redefinição de senha e remoção. Um administrador não pode remover a própria conta nem o próprio perfil de administrador.

### 5.3 Backup

Exportação de todos os cadastros em um arquivo JSON e importação para restaurar. A importação **substitui todos os dados** e vale para toda a equipe; fica registrada no Histórico como um único evento. Formatos antigos continuam sendo aceitos na restauração.

---

## 6. Acesso e perfis

| Perfil | Visualiza | Altera |
|---|---|---|
| **Administrador** | tudo | tudo; gerencia usuários e backup |
| **Supervisão** | cadastros e histórico | os cadastros |
| **Leitura** | tudo | nada |

No perfil de Leitura, os formulários e botões de gravação ficam desativados e um aviso aparece no topo; continuam disponíveis os seletores, filtros, a simulação de cenários e as impressões. A proteção não é apenas visual: o banco de dados recusa gravações de quem não tem permissão. Não há recuperação de senha pelo próprio usuário — o administrador redefine na tela Usuários.

---

## 7. Preferências locais × dados compartilhados

| Ficam no navegador de cada pessoa | Ficam no banco, para toda a equipe |
|---|---|
| ano, mês atual, unidade e prazo de eliminação | unidades, colaboradores, funções, portes |
| filtros das telas e porte selecionado | lançamentos mensais (demanda, clientes ativos, atendidas) |
| modo da tela Colaboradores e orientação de impressão | parâmetros do Calendário |
| — | usuários e perfis |

---

## 8. Recursos de apoio

- **Impressão em PDF**: o Headcount e o organograma imprimem apenas o conteúdo, sem o menu, com cabeçalho identificando unidade, período e data de emissão.
- **Aviso de nova versão**: quando uma atualização é publicada, aparece a faixa "Nova versão disponível" com o botão **Atualizar agora**. A verificação ocorre ao voltar para a aba e a cada 10 minutos.
- **Recarga automática dos dados** ao voltar para a aba, para refletir lançamentos feitos por outras pessoas.
- **Menu lateral fixo**, com contadores de unidades e colaboradores.
- **Validações**: alocação total de um colaborador limitada a 100%, nomes duplicados recusados, data de desligamento anterior à admissão recusada, ciclos de chefia impedidos, valores negativos bloqueados.

---

## 9. O que o programa não faz

- Não controla documentos individualmente (não substitui o SGG): trabalha com quantidades por unidade, mês, condição e porte.
- Não registra ponto, férias ou afastamentos — apenas admissão, desligamento e percentual de tempo por unidade.
- Não congela os meses já apresentados: corrigir um lançamento antigo recalcula o histórico daquele mês em diante.
- Não envia e-mails nem notificações.
- Não move equipe entre unidades automaticamente: a sobra de uma unidade não cobre a falta de outra.

---

## 10. Apêndice técnico

- **Interface**: Vue 3 + Vite, Pinia, Vue Router (rotas em hash), Tailwind CSS v4, Chart.js para os gráficos e SheetJS para a leitura de planilhas. Publicação automática na Vercel a partir do branch `main`.
- **Motor de cálculo**: `js/calculo.js` — funções puras, sem interface, com testes automatizados (`npm test`). É a única fonte da lógica: `Calculo.fluxo()` é o núcleo (cadeia, coortes, QLP e custo) e `fila()`/`evolucao()` são adaptadores dele; a versão usada pela interface é copiada desse arquivo na compilação. A matemática está documentada em [docs/MODELO-DE-CALCULO.md](docs/MODELO-DE-CALCULO.md).
- **Banco de dados**: Supabase (PostgreSQL). Tabelas principais — `unidades`, `demanda_mensal` (unidade × ano × mês × condição × porte), `unidade_mes` (clientes ativos e atendidas), `colaboradores`, `colaborador_unidades`, `funcoes`, `portes`, `clientes_porte`, `parametros`, `historico`.
- **Segurança**: autenticação por e-mail e senha, perfis em `app_metadata`, políticas RLS por perfil, gatilhos de histórico e funções específicas para importação de planilha e de backup. A gestão de usuários passa por uma Edge Function com a chave de serviço no servidor.
- **Testes**: 15 casos no motor de cálculo, 35 no dimensionamento (UEP, capacidade, cadeia, coortes e idade, QLP nas três leituras, custo, invariantes e casos extremos) e 8 na importação de planilhas.
