# Chabra Dimensiona — front novo (Vue 3 + Vite)

Reescrita do front em SPA, **contra o mesmo banco** (Supabase) e **com o mesmo motor**
(`../js/calculo.js`) do app atual. Enquanto não chega à paridade, o app atual continua
em produção (raiz do repositório, Vercel).

## Rodar

```
cd web
npm install
npm run dev      # http://127.0.0.1:5173  (sincroniza o motor antes)
npm run build    # dist/  (também sincroniza)
npm test         # testes do motor (node ../tests/calculo.test.js)
```

O projeto Supabase é o da Chabra por padrão (chave publishable, pública por design;
RLS protege). Para apontar para outro, copie `.env.example` para `.env`.

## Arquitetura (Etapa 3)

```
web/
  scripts/sync-engine.mjs   copia ../../js/calculo.js → src/engine/calculo.js (+ export default)
  src/
    engine/calculo.js       MOTOR — puro, gerado; fonte única continua em ../js/calculo.js
    services/
      supabase.js           cliente único + erroAmigavel()
      api.js                única camada que fala com o banco; devolve objetos do domínio
      importacao.js         importador de planilha (SGG "Vencimento(s) de PGR(s)"): ler, detectar colunas, contar por
                            unidade × mês, filtro de situação (puro; testes em tests/importacao.test.mjs)
    stores/  (Pinia)
      auth.js               sessão, papel (admin | supervisor | leitura), podeEditar, entrar/sair
      cadastros.js          FONTE ÚNICA DE DADOS: funcoes, unidades (mesesPorAno), colaboradores,
                            portes, parametros; carregar(); escritas que atualizam o cache;
                            getters para o motor (unidadesDoAno, colaboradoresCompletos, pesosPorte);
                            exportarBackup / importarBackup
      preferencias.js       só do navegador: ano, mês atual, unidade, simulação "E se…?" (localStorage)
      dimensionamento.js    SÓ DERIVAÇÕES: resultado = Calculo.calcular(...), filaInicial (pendente do ano
                            anterior → janeiro), fila = Calculo.fila(...), alvo, hoje — muda um cadastro, recalcula
    router/index.js         rotas + TELAS (menu) + guard por papel
    composables/useFormat.js num, numFte, moeda, meses
    components/
      layout/Sidebar.vue    menu por seção, filtrado pelo papel; usuário e Sair
      BarraOpcoes.vue       ano · mês atual · unidade (liga na store de preferências)
      colaboradores/        Organograma.vue (indicadores + barras + árvore + impressão),
                            OrgChefe.vue (nó recursivo), OrgEquipe.vue, OrgPessoa.vue
    views/
      LoginView.vue
      DimensionamentoView.vue   tela "Projeção" (rota /projecao): barra + Hoje + TabelaMeses + Simulacao + avisos
      DashboardView.vue         gráficos (Chart.js via components/ui/Grafico.vue) sobre a store de dimensionamento
      MesView.vue               resumo de um mês: acumulado, vencimentos, equipe, composição do acumulado e projeção
      EvolucaoView.vue          controle histórico (Calculo.evolucao): fila, capacidade, quadro real × necessário, impressão
      DiretoriaView.vue         visão executiva (Calculo.fluxo): UEP, capacidade, backlog com idade, gargalo, QLP em 3 leituras, custo
      Unidades/Empresas/Colaboradores/Funcoes/Calendario/Historico/UsuariosView.vue
  src/composables/organograma.js  árvore do organograma (pura): chefias pela hierarquia das funções + equipes por unidade
  src/composables/useVersao.js    avisa quando uma nova versão é publicada (compara o script do index.html) → faixa em App.vue
  src/style.css             Tailwind v4 + tokens da marca (@theme) + peças (.card, .stat, .table, .status, .org-*…) + impressão do organograma
```

### Fluxo de dados

```
Supabase ──api.carregarTudo()──▶ stores/cadastros ──┐
                                                    ├──▶ stores/dimensionamento (computed) ──▶ views
localStorage ──▶ stores/preferencias ───────────────┘            │
                                                                 └── engine/calculo.js (puro)
views ──ações──▶ stores/cadastros ──api.*──▶ Supabase   (o cache é atualizado sem recarregar)
```

Regras: componentes nunca importam `api.js` nem o motor diretamente — só stores.
O motor nunca importa nada de Vue/Supabase. `api.js` não guarda estado.

## Etapa 4 (feita)

Componentes do Dimensionamento (`components/dimensionamento/`): `TabelaMeses.vue` (12 meses:
vencem, pendente, hoje → ideal por área, conclusão com R$), `PorUnidade.vue`, `Simulacao.vue`
(E se…?, com ramp-up). Telas de cadastro em `views/`: Unidades, Empresas por Unidade (porte),
Colaboradores (admissão/desligamento/custo, alocações), Funções (custo), Calendário (dias úteis,
folga, prazo, ramp-up, pesos dos portes), Histórico, Usuários (Edge Function + backup).
`stores/ui.js` + `components/ui/Avisos.vue`: toasts e confirmação. Acesso de leitura: formulários
escondidos/desabilitados via `auth.podeEditar`.

Ainda não portado: modo **Organograma** e impressão (tela Colaboradores do app atual).

## Deploy

`vercel.json` na raiz do repositório: `installCommand: cd web && npm ci`, `buildCommand: cd web &&
npm run build`, `outputDirectory: web/dist`. Todo push em `main` publica o front novo em
https://dimensionamento-chabra.vercel.app (hash routing, sem rewrites). Rollback: apagar o
`vercel.json` volta a publicar o app vanilla da raiz.
