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

## 3. Telas de dimensionamento

### 3.0 Diretoria (visão executiva)

Uma página para a decisão de contratação, com impressão em PDF:

- **Carteira, demanda (UEP), capacidade da cadeia (nominal, margem e planejada) e backlog** com a parcela **fora do prazo**.
- **Quadro de lotação (QLP)** por área, em três leituras — operacional (manter a operação), recuperação (eliminar o backlog no prazo), estrutural (quadro permanente) — além do pico do ano, do reforço temporário e do déficit; com custo atual, necessário e incremental quando há custo cadastrado.
- **Onde está o gargalo**: entrada, capacidade, conclusão, ociosidade e fila de cada etapa da cadeia, com a etapa gargalo destacada.
- **Gráficos**: demanda × capacidade, backlog mês a mês (real e com as admissões sugeridas), idade do backlog por faixa e quadro atual × necessário.

### 3.05 Headcount (eliminar o vencido)

Responde diretamente: **quantas pessoas para zerar os documentos vencidos acumulados até o mês escolhido?** Ano, mês e unidade vêm da barra; o prazo de eliminação (1, 2, 3, 6 ou 12 meses) é escolhido na própria tela.

- **Cartões**: vencido acumulado até o mês (com a parcela herdada de anos anteriores), o que vence no mês, a equipe atual e quantas pessoas faltam para o prazo escolhido.
- **Equipe da unidade, pessoa por pessoa**: a lista de quem está alocado ali no mês, com a alocação, a presença (quem entrou ou saiu no meio do mês), a produção diária declarada e quanto cada um equivale em tempo integral — a conferência do número da equipe contra o cadastro. A chefia alocada na unidade aparece à parte, porque coordena e não entra no quadro.
- **Quadro necessário para o prazo escolhido**: uma linha só, a do prazo selecionado nos botões — o trabalho total (vencido + o que vence durante o período), o volume mensal, o quadro por área, o total, o déficit e o custo. Prazos que passam de dezembro usam a média do ano e são marcados como estimados.
- **Onde entra cada pessoa**: o mesmo cálculo por etapa da cadeia (inspeção, relatório, finalização), mostrando a etapa que exige mais gente.
- **Há quanto tempo está vencido**: faixas de idade e a parcela fora do prazo.

### 3.1 Projeção

A tela de resultado, de uma unidade por vez, para o ano selecionado.

- **Pendências atuais**: o total em aberto no mês atual, separando o que veio acumulado dos meses anteriores (com a parcela herdada do ano anterior) e o que vence no mês.
- **Por área (técnicos e administrativos)**: equipe atual → quadro ideal do mês; quantas pessoas eliminariam as pendências dentro do prazo, com o custo mensal; produção diária da equipe; quantos estão em período de adaptação.
- **Tabela dos 12 meses**: vencimentos, pendências ao fim do mês, quadro atual → ideal por área e a conclusão de cada mês — "Contratação necessária: 1 técnico e 2 administrativos", "Equipe suficiente", "margem reduzida" — com o custo quando há valores cadastrados. Meses já decorridos aparecem como realizado; do mês atual em diante, como projeção. O rodapé traz o total do ano, as pendências de dezembro e o quadro necessário para atender todos os meses.
- **Simulação de cenários**: linhas de contratação (quantidade positiva) ou desligamento (negativa) por unidade, área, período e produção diária. Recalcula tudo na hora, inclusive meses passados, com período de adaptação. Fica apenas no navegador de quem simula.
- **Avisos de cadastro**: colaboradores sem unidade, alocação parcial, unidades com demanda e sem equipe, unidades sem profissionais de uma área.

### 3.2 Resumo do mês

A foto de um único mês (o escolhido na barra), própria para reunião ou PDF:

- Acumulado até aquele mês, vencimentos do mês, total a atender e quanto a equipe consegue atender, pendências ao fim do mês.
- Equipe do mês por área: quadro atual → ideal, quantas pessoas eliminariam as pendências no prazo, capacidade e produção diária.
- **De onde vem o acumulado**: uma linha por mês anterior (o que venceu, o que foi atendido, o que permaneceu em aberto) até o total que chega no mês escolhido.
- **Projeção com a equipe atual**: os três meses seguintes, em que mês as pendências zeram e quanto sobra em dezembro.
- Botão **Imprimir** (também salva em PDF).

### 3.3 Dashboard

Os mesmos números em gráficos, uma unidade por vez: pendências ao fim de cada mês (distinguindo meses decorridos, mês atual e projeção), vencimentos × produção da equipe, equipe atual × quadro ideal por área e o impacto financeiro mensal (contratações necessárias × excedente de pessoal).

### 3.4 Evolução (controle histórico)

Responde à pergunta da diretoria: **mês a mês, o quadro estava suficiente? Quantas admissões seriam necessárias?**

- **Cartões**: meses com quadro insuficiente (e desde quando), admissões que seriam necessárias, pendências em dezembro (real e no cenário com as admissões) e custo médio do déficit.
- **Tabela**: fila inicial, entrada do mês, atendidas, fila final e, por área, quadro real com duas leituras do necessário —

  | Coluna | Pergunta que responde |
  |---|---|
  | **vazão** | Quantas pessoas para dar conta do que entra no mês (não deixar a fila crescer)? |
  | **recuperação** | Quantas pessoas para dar conta da entrada **e** diluir a fila dentro do prazo? |

- **Cenário "se tivéssemos contratado"**: as admissões sugeridas são acumulativas (quem entra permanece) e entram com período de adaptação; os gráficos comparam a fila real com a fila que teríamos.
- **Gráficos**: fila com e sem as admissões, entrada × capacidade por área, quadro real × necessário.
- Avisos quando faltam dados: sem a linha *Atendidas no mês*, o histórico apenas acumula; sem datas de admissão, a equipe é considerada constante.
- Botão **Imprimir**.

---

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
| ano, mês atual, unidade selecionada | unidades, colaboradores, funções, portes |
| filtros das telas e porte selecionado | lançamentos mensais (demanda, clientes ativos, atendidas) |
| modo da tela Colaboradores e orientação de impressão | parâmetros do Calendário |
| simulação de cenários | usuários e perfis |

---

## 8. Recursos de apoio

- **Impressão em PDF**: organograma, Resumo do mês e Evolução imprimem apenas o conteúdo, sem o menu, com cabeçalho identificando unidade, período e data de emissão.
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
