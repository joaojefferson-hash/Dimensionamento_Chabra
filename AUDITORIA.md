# Auditoria técnica do motor de dimensionamento — Chabra Dimensiona

> Diagnóstico anterior a qualquer alteração de código. Data: 18/09/2026.
> Escopo: motor (`js/calculo.js`), stores e serviços do front (`web/src`), telas, importação de planilhas, banco (schema, RLS, funções), backup, histórico, testes.
> Método: leitura do código, execução de sondas numéricas sobre o motor (cenários controlados), consulta ao schema e às políticas do banco, e verificação dos avisos de segurança do Supabase. Nenhum dado de produção foi alterado.

---

## 1. Resumo executivo

O motor está **internamente coerente na maior parte dos invariantes** testados: aumentar a demanda nunca reduz o quadro necessário, aumentar a equipe nunca aumenta o backlog, o backlog nunca fica negativo, o arredondamento do quadro sempre cobre a demanda, a alocação parcial soma corretamente entre unidades e a transição de dezembro para janeiro não duplica a fila.

Há, porém, **quatro problemas que afetam decisão gerencial** e precisam de correção antes de o material ir à diretoria:

1. Duas telas mostram **backlogs diferentes** para o mesmo mês (divergência comprovada de 120 UEP no cenário de teste).
2. O modelo **não trata as etapas como uma cadeia**: o administrativo é dimensionado sobre a demanda total, e não sobre o que os técnicos conseguem entregar. Isso produz a leitura "há excedente administrativo" enquanto a operação está travada nos relatórios.
3. Não existe o conceito de **QLP estrutural** nem de **idade do backlog**; "eliminar a fila em 60 dias" e "quadro permanente" estão misturados.
4. A conversão de **atendidas em UEP usa o peso médio do mês** — uma aproximação que pode errar até 100% quando a carteira mistura portes.

---

## 2. Achados por prioridade

### CRÍTICO

**C1. Projeção/Dashboard e Evolução calculam a fila com regras diferentes.**
`Calculo.fila()` (`js/calculo.js:582`) ignora as atendidas informadas — nos meses passados assume sempre `atendidas = 0`. `Calculo.evolucao()` (`js/calculo.js:717`) usa as atendidas informadas. As duas são consumidas por telas diferentes (`web/src/stores/dimensionamento.js:45` e `:67`).
*Evidência*: cenário com 40 UEP/mês e atendimento informado em jan–mar → **Projeção: 360 UEP de pendências em setembro; Evolução: 240 UEP**. A mesma pergunta, dois números, na mesma sessão.
*Causa*: duplicação da mesma recorrência em duas funções.

**C2. A cadeia produtiva é modelada como três filas independentes.**
`precisaMes()` (`js/calculo.js:153`) devolve a demanda integral do mês para **todas** as entregas (inspeção, relatório, finalização). O administrativo é dimensionado como se recebesse toda a carteira, quando só pode finalizar o que já foi inspecionado e relatado.
*Evidência*: demanda 100 UEP/mês, 1 técnico (17,85 UEP de capacidade no gargalo) e 1 administrativo com produção alta (178,5 UEP) → o sistema classifica o administrativo como "ok" e a conclusão real da cadeia é **17,85 UEP/mês**. A capacidade administrativa ociosa aparece como recurso disponível, e o gargalo não é nomeado.
*Consequência gerencial*: risco de contratar na etapa errada.

**C3. Unidades de medida misturadas no atendimento.**
As atendidas são informadas em **número de empresas** e convertidas para UEP pelo **peso médio do mês** (`js/calculo.js:717`).
*Evidência*: mês com 10 clientes P e 10 G (30 UEP, peso médio 1,5) → 10 atendidas viram 15 UEP; se as 10 forem pequenas, o correto seriam 10 UEP; se grandes, 20 UEP. Erro de até ±33% nesse exemplo e maior em carteiras mais desiguais.

### ALTO

**A1. Não existe idade do backlog nem coortes.** O backlog é um número único por área. Não é possível responder "quanto está fora do prazo" nem "há quanto tempo". O parâmetro de 60 dias é usado apenas como divisor do backlog (`fila/prazoMeses`), o que não é a mesma pergunta.

**A2. Não existe QLP estrutural.** O sistema calcula o quadro para a demanda do mês (vazão) e o quadro para recuperar a fila no prazo, mas não separa o que é **permanente** do que é **temporário de recuperação**. A diretoria precisa dos dois para decidir entre contratação efetiva e reforço temporário.

**A3. Importação pode apagar meses ausentes do arquivo.** `substituir_demanda_ano` apaga o ano inteiro (da condição escolhida, nas unidades do lote) antes de inserir. Um arquivo com apenas parte do ano zera os demais meses daquela condição. O texto da tela avisa "todos os meses", mas o risco de perda é real — já ocorreu uma vez e foi recuperado pelo histórico.

**A4. Regras de negócio duplicadas na interface.** A regra "a fila da unidade é o maior valor entre as áreas" aparece em quatro arquivos (`DashboardView.vue:38`, `EvolucaoView.vue:32-33`, `MesView.vue:44,86,92`, `TabelaMeses.vue:45,59`), e as frases de conclusão do mês são construídas em duas telas com critérios diferentes (`TabelaMeses.vue:26` usa vazão da Projeção; `EvolucaoView.vue:42` usa a vazão da Evolução). Fórmulas fora do motor divergem com o tempo.

**A5. Presença proporcional a dias corridos.** `presencaNoMes()` (`js/calculo.js:118`) usa a fração de **dias do calendário**, multiplicada depois pelos dias úteis do mês. Para admissão em 25/01/2026 resulta em 4,74 dias úteis quando os dias úteis reais restantes são 5. O erro é pequeno em média, mas é sistemático e pode inverter o arredondamento de uma pessoa.

### MÉDIO

**M1. `ocupacaoAlvo = 0` é silenciosamente convertido em 85.** `normalizarParametros` (`js/calculo.js:491`) usa `|| 85`, e zero é falso em JavaScript. Margem de 100% vira margem de 15% sem aviso. Não é alcançável pela tela (limite de 90%), mas é alcançável por importação de backup.

**M2. Zero dias úteis devolve "ninguém é necessário".** Com `diasUteis = 0` e demanda 40 UEP, o quadro ideal é 0 e não há alerta. O correto é sinalizar impossibilidade de atendimento.

**M3. Produtividade de referência inventada quando não há equipe.** Sem nenhum colaborador cadastrado, o motor usa `COLAB_PADRAO` (2 inspeções, 2 relatórios, 2 empresas por dia) para calcular o quadro ideal. É uma premissa razoável, mas hoje não aparece na tela — o número parece medido.

**M4. Prazo convertido por arredondamento grosseiro.** `prazoMeses = round(prazoDias / 30)` (`stores/dimensionamento.js:17`): 45 dias viram 2 meses, 75 viram 3. Perde precisão e não acompanha o mês com menos dias úteis.

**M5. Custo sem separação conceitual.** `custoFuncao()` calcula apenas "contratar quem falta" e "custo da sobra". Não há custo atual, custo estrutural, custo temporário de recuperação nem custo incremental anualizado.

**M6. Concorrência sem proteção.** As células de Empresas por Unidade e os parâmetros do Calendário gravam por último-escreve-vence, sem detecção de conflito. Duas pessoas editando o mesmo mês sobrescrevem uma à outra silenciosamente (o histórico registra, mas ninguém é avisado).

**M7. Fallback legado de contagem.** `empresasPonderadas` cai para `empresasVencidas + empresasExclusivaTst` quando não há objeto de demanda — ignora as duas condições novas. Só afeta dados em formato antigo.

### BAIXO

**B1. Proteção contra senhas vazadas desativada** no Supabase Auth (único aviso de segurança do projeto).
**B2. Sem lint configurado** no repositório (`npm test` cobre apenas os testes do motor e da importação).
**B3. Recalculo integral a cada alteração reativa** — três passagens completas pelo motor (ano corrente, ano anterior, evolução). Irrelevante no volume atual (7 unidades), mas cresce com o número de unidades.
**B4. Cobertura de testes insuficiente para o escopo**: 15 casos no motor e 8 na importação, sem testes de invariantes, de casos extremos nem das telas.

---

## 3. O que já está correto (e deve ser preservado)

- Invariantes verificados: monotonicidade do QLP em relação à demanda; backlog não negativo; desligamento nunca aumenta capacidade; QLP arredondado para cima sempre cobre a demanda; soma das unidades igual ao total na capacidade.
- Transição de ano sem duplicação de backlog.
- Alocação parcial distribuída proporcionalmente, com limite de 100% validado na interface **e** no banco (gatilho `checar_soma_alocacoes`).
- RLS ativa nas 11 tabelas, com escrita condicionada a `public.pode_editar()` e leitura para autenticados; histórico gravado por gatilho, não pela interface; gestão de usuários isolada em Edge Function com a chave de serviço no servidor.
- Motor puro, sem DOM, sem Supabase e sem Vue — mesma entrada, mesma saída.
- Importação idempotente por (unidade × ano × mês × cliente) no critério "cada cliente uma vez por mês".

---

## 4. Modelo conceitual proposto

Separação explícita dos oito conceitos, todos em **UEP** (Unidade Equivalente de Produção; pesos parametrizáveis, hoje P 1,0 · M 1,5 · G 2,0):

| Conceito | Definição | Unidade |
|---|---|---|
| **A. Demanda** | clientes que vencem no mês × peso do porte | UEP/mês |
| **B. Capacidade** | nominal (produção declarada × dias úteis × alocação × presença × adaptação) e planejada (nominal × (1 − margem)) | UEP/mês |
| **C. Backlog** | fila inicial + demanda − atendidas, por etapa e por coorte de origem | UEP |
| **D. QLP operacional** | pessoas para atender a demanda recorrente sem aumentar o backlog | pessoas |
| **E. QLP de recuperação** | pessoas para atender a demanda **e** eliminar o backlog no prazo | pessoas |
| **F. QLP estrutural** | pessoas necessárias depois de normalizado o backlog | pessoas |
| **G. Custo** | atual, estrutural, temporário de recuperação, incremental e anualizado | R$/mês e R$/ano |
| **H. Prazo** | idade do backlog por faixas (0–30, 31–60, 61–90, 91–120, +120 dias) | dias |

**Cadeia produtiva** — três etapas em série, cada uma com fila própria:

```
demanda → [inspeção] → [relatório] → [finalização] → concluído
```

Cada etapa recebe como entrada o que a etapa anterior concluiu (a primeira recebe a demanda do mês). A conclusão do mês é limitada pela etapa gargalo, e o sistema passa a nomear o gargalo e a mostrar capacidade ociosa a jusante como ociosidade, não como folga.

**Coortes** — o backlog guarda o mês de origem de cada parcela; o consumo é FIFO (mais antigo primeiro). Daí saem as faixas de idade e a resposta "quanto está fora do prazo".

**Unidade de atendimento informado** — decisão pendente (ver seção 6): informar atendidas por porte, ou aceitar a aproximação pelo peso médio com o erro documentado na tela.

---

## 5. Plano de implementação proposto

Cada fase termina com testes automatizados verdes e a interface funcionando; nenhuma funcionalidade é removida.

| Fase | Conteúdo | Risco |
|---|---|---|
| **1. Motor unificado** | uma única recorrência (`fila` e `evolucao` passam a consumir o mesmo núcleo), atendidas informadas valendo em todas as telas, correção de `ocupacaoAlvo = 0`, presença por dias úteis, alerta de dias úteis zero e de produtividade de referência | médio — muda números exibidos (para melhor); exige revisão dos testes existentes |
| **2. Cadeia e gargalo** | filas por etapa, entrada de cada etapa limitada pela conclusão da anterior, identificação do gargalo e da ociosidade por etapa | alto — é a mudança matemática de fundo |
| **3. Coortes e prazo** | backlog por mês de origem, consumo FIFO, faixas de idade, indicador "fora do prazo" | médio |
| **4. QLP em três leituras** | operacional, recuperação e estrutural, com custos separados (atual, estrutural, temporário, incremental, anualizado) | médio |
| **5. Visão executiva** | tela para a diretoria com os indicadores da seção 26 do escopo, gráficos revisados e impressão | baixo |
| **6. Testes e documentação** | bateria de invariantes e casos extremos, cenário de validação da seção 45, atualização de MANUAL/README/FUNCIONALIDADES | baixo |

Compatibilidade de dados: nenhuma fase exige apagar dados. As coortes e as etapas são derivadas dos lançamentos já existentes; se as atendidas passarem a ser informadas por porte, a migração converte o valor único existente em uma distribuição proporcional aos portes do mês, preservando o total.

---

## 6. DECISÕES NECESSÁRIAS DA EMPRESA

Não serão transformadas em regra sem confirmação.

1. **Pesos de porte.** É preciso confirmar que uma empresa média representa 1,5 vez o esforço de uma pequena e uma grande, 2,0. Os pesos são a base de toda a conversão em UEP.
2. **Unidade do atendimento informado.** Informar as atendidas **por porte** (preciso) ou manter um número único com conversão pelo peso médio (aproximado)?
3. **Sequência da cadeia.** Confirmar que a ordem é inspeção → relatório → finalização administrativa, que toda empresa passa pelas três etapas e que não há etapas executadas em paralelo.
4. **Produção declarada dos técnicos.** Hoje são dois números por pessoa (inspeções/dia e relatórios/dia). Confirmar se é assim na operação ou se um técnico alterna entre as duas atividades no mesmo dia (o que muda a forma de somar a capacidade).
5. **Prazo regulatório.** O prazo de 60 dias é contado a partir do vencimento do documento? É o mesmo para todas as condições (Mensal, Exclusiva TST, Empresa sem avaliação, Contratos novos)?
6. **Horizonte de recuperação.** Em quantos meses a diretoria pretende eliminar o backlog atual? Esse número define o QLP de recuperação e o custo temporário.
7. **Capacidade compartilhada entre unidades.** Hoje cada unidade é autossuficiente. Deve existir simulação de aproveitamento de capacidade ociosa entre unidades (por exemplo, atendimento remoto do relatório)?
8. **Contratos novos e empresas sem avaliação.** Exigem o mesmo esforço de um vencimento comum, ou têm esforço próprio (por exemplo, avaliação inicial mais longa)?

---

## 7. Evidências

Sondas executadas sobre o motor (cenários controlados, sem dados de produção):

- Divergência Projeção × Evolução: 360 UEP × 240 UEP no mesmo mês.
- Cadeia: conclusão real 17,85 UEP/mês contra capacidade administrativa declarada de 178,5 UEP/mês.
- Presença: 4,74 dias úteis calculados contra 5 dias úteis reais (admissão em 25/01/2026).
- UEP das atendidas: 10 empresas informadas → 15 UEP pelo peso médio, contra 10 ou 20 UEP conforme o porte real.
- Invariantes e 11 casos extremos: todos sem exceção não tratada; falhas conceituais registradas em M1 e M2.
