# Modelo de cálculo — Chabra Dimensiona

> Documentação da matemática do dimensionamento. Serve de referência para auditar qualquer número
> apresentado à diretoria. Implementação: `js/calculo.js` (funções puras); testes: `tests/calculo.test.js`
> e `tests/dimensionamento.test.js`.

---

## 1. UEP — Unidade Equivalente de Produção

Clientes de portes diferentes exigem esforços diferentes. Para somar tudo na mesma moeda, o sistema
converte cada cliente em **UEP**:

```
UEP = Σ (clientes do porte × peso do porte)
```

Pesos padrão, **parametrizáveis** no Calendário: Pequeno 1,0 · Médio 1,5 · Grande 2,0. Um porte
desconhecido vale 1,0.

Tudo o que é comparado está em UEP: demanda, capacidade, atendimento e backlog. As telas mostram
**as duas medidas** quando elas divergem — "220 clientes · 227 UEP" —, nunca uma no lugar da outra.

> **Decisão pendente da empresa:** os pesos 1,0 / 1,5 / 2,0 foram confirmados pela diretoria, mas nunca
> foram medidos contra horas reais de trabalho. Revisá-los muda todos os números proporcionalmente.

## 2. Demanda

```
demanda(unidade, mês) = Σ clientes que vencem no mês × peso do porte
```

Somam-se as quatro condições (Mensal, Exclusiva TST, Empresa sem avaliação, Contratos novos). Todas
exigem o mesmo esforço por porte — se isso mudar, será preciso peso por condição.

## 3. Capacidade

```
capacidade nominal(pessoa, etapa, mês) = produção diária declarada
                                        × dias úteis do mês
                                        × % de alocação na unidade
                                        × presença no mês
                                        × fator de adaptação

capacidade planejada = capacidade nominal × (1 − margem para imprevistos)
```

- **Presença**: proporção de **dias úteis** (segunda a sexta) entre admissão e desligamento dentro do mês.
  Quem entra no dia 16 de janeiro de 2026 conta 11/22 — e não 16/31, como antes da revisão.
- **Adaptação**: 1º mês 50%, 2º 80%, depois 100% (configurável). Vale para admissões reais e simuladas.
- **Margem para imprevistos**: padrão 15%. As telas mostram **nominal**, **margem** e **planejada** —
  o desconto nunca fica escondido.

## 4. A cadeia produtiva

Toda empresa percorre três etapas, **em série**:

```
demanda do mês → [inspeção] → [relatório] → [finalização administrativa] → concluído
```

- Cada etapa recebe **o que a etapa anterior concluiu** no mês; a primeira recebe a demanda.
- Cada etapa tem a sua própria fila. O **backlog da unidade é a soma das três filas** — cada UEP está
  em exatamente uma delas.
- A **conclusão do mês é limitada pela etapa gargalo**. Capacidade sobrando em uma etapa a jusante é
  **ociosidade** (falta trabalho vindo de trás), não folga: contratar ali não aumenta a conclusão.
- Técnicos atendem duas etapas (inspeção e relatório) com produções diárias declaradas separadamente;
  administrativos atendem a finalização.

## 5. Backlog, coortes e idade

```
fila(etapa, mês) = fila anterior + entrada da etapa − concluído
```

- **Coortes**: cada parcela da fila guarda o mês em que venceu. O consumo é **FIFO** — o mais antigo sai
  primeiro. As coortes atravessam **todos** os anos com lançamento: ao abrir 2026, o sistema recalcula
  2025 (e qualquer ano anterior) em ordem e carrega o que ficou em aberto, com a idade preservada. O
  vencido não zera na virada do ano.
- **Idade**: faixas de 0–30, 31–60, 61–90, 91–120 e mais de 120 dias, por aproximação de 30 dias por mês
  (o sistema trabalha com quantidades mensais, não com documentos individuais).
- **Fora do prazo**: parcela do backlog com idade maior ou igual ao prazo de atendimento configurado.

### Atendimento informado

O que a equipe concluiu é informado em **Empresas por Unidade → Atendidas no mês**, por porte, na mesma
unidade da demanda. Converte-se em UEP pelos mesmos pesos — sem aproximação.

- Meses **já decorridos sem informação**: acumulam tudo (nada é descontado).
- Meses **com informação**: a fila usa o informado.
- Mês atual e futuros: cada etapa conclui o que a sua capacidade permite.

Se o atendimento for informado como número único (formato antigo), o sistema converte pelo peso médio do
mês e marca o valor como aproximado.

## 6. QLP — quadro de lotação, em três leituras

| Leitura | Pergunta | Fórmula (por etapa) |
|---|---|---|
| **Operacional** | Quantas pessoas para não deixar o backlog crescer? | ⌈ demanda do mês ÷ produção de uma pessoa ⌉ |
| **Recuperação** | Quantas pessoas para atender a demanda **e** eliminar o backlog no prazo? | ⌈ (demanda + fila que ainda passa pela etapa ÷ prazo em meses) ÷ produção de uma pessoa ⌉ |
| **Estrutural** | Quantas pessoas depois de normalizado o backlog? | ⌈ demanda média do ano ÷ produção de uma pessoa ⌉ |

Detalhes que importam:

- Cada etapa é dimensionada contra a **demanda**, não contra a entrada estrangulada pelo gargalo — senão
  o gargalo esconderia a necessidade das etapas seguintes.
- Na recuperação, conta a **fila acumulada até aquela etapa**: o que está parado na inspeção ainda vai
  exigir relatório e finalização.
- O QLP de uma **área** é o maior entre as suas etapas (a mesma pessoa cobre inspeção e relatório).
- **Reforço temporário** = recuperação − estrutural. É o que sai da folha quando o backlog normalizar.
- Arredondamento **sempre para cima**, e sempre verificado: `QLP × produção por pessoa ≥ demanda`.

## 7. Custo

Calculado apenas quando há custo mensal cadastrado (por colaborador ou por função) — nunca estimado:

| Indicador | Cálculo |
|---|---|
| Custo atual | quadro atual × custo médio da pessoa |
| Custo estrutural | QLP estrutural × custo |
| Custo de recuperação | (QLP de recuperação − QLP estrutural) × custo — temporário |
| Custo incremental | (QLP de recuperação − quadro atual) × custo |
| Custo anualizado | incremental × 12 |

## 8. Cenário "se tivéssemos contratado"

Repete a cadeia inteira admitindo as pessoas sugeridas: **acumulativas** (quem entra permanece) e com o
período de adaptação, como uma contratação real. Serve para comparar a fila real com a fila que teríamos.
Não altera nenhum dado.

## 8.1 Headcount para eliminar o vencido

```
trabalho(etapa, N meses) = vencido acumulado que ainda passa pela etapa
                         + o que vence nos N meses do período
pessoas(etapa)           = ⌈ (trabalho ÷ N) ÷ produção de uma pessoa no mês ⌉
pessoas(área)            = a maior entre as etapas da área
déficit                  = pessoas − quadro atual (nunca negativo)
```

Todo documento passa pelas três etapas, então o trabalho do período é o mesmo em cada uma — o que muda é a produção por pessoa. Quando o prazo ultrapassa dezembro, os meses que faltam entram pela média mensal do ano e o cenário é marcado como **estimado**.

## 9. Recálculo e alterações retroativas

A recorrência olha sempre para a frente: alterar o lançamento de um mês recalcula **aquele mês e os
seguintes**; os anteriores não mudam. A fila de dezembro entra em janeiro do ano seguinte, com as
coortes preservadas.

## 10. Limites conhecidos e premissas declaradas

- **Coortes mensais**: a idade do backlog é aproximada em múltiplos de 30 dias. Não há data por documento.
- **Etapas intermediárias estimadas**: o atendimento é informado como conclusão (fim da cadeia); a divisão
  entre inspeção e relatório é estimada pela capacidade.
- **Fluxo dentro do mês**: uma empresa pode percorrer as três etapas no mesmo mês (não há defasagem forçada).
- **Produção de referência**: sem ninguém alocado em uma etapa, o QLP usa a produtividade média da equipe
  (ou o padrão do sistema). As telas marcam esse caso como estimativa.
- **Sem capacidade compartilhada**: a equipe de uma unidade não atende a fila de outra.
- **Mês sem dias úteis ou sem produção declarada**: o sistema informa que não é possível dimensionar em
  vez de devolver "ninguém é necessário".
- **Sem congelamento**: corrigir um lançamento antigo reescreve o histórico daquele mês em diante.
