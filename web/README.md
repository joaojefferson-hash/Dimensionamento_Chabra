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
    stores/  (Pinia)
      auth.js               sessão, papel (admin | supervisor | leitura), podeEditar, entrar/sair
      cadastros.js          FONTE ÚNICA DE DADOS: funcoes, unidades (mesesPorAno), colaboradores,
                            portes, parametros; carregar(); escritas que atualizam o cache;
                            getters para o motor (unidadesDoAno, colaboradoresCompletos, pesosPorte);
                            exportarBackup / importarBackup
      preferencias.js       só do navegador: ano, mês atual, unidade, simulação "E se…?" (localStorage)
      dimensionamento.js    SÓ DERIVAÇÕES: resultado = Calculo.calcular(...), fila = Calculo.fila(...),
                            alvo (unidade ou total), hoje (3 números) — muda um cadastro, recalcula
    router/index.js         rotas + TELAS (menu) + guard por papel
    composables/useFormat.js num, numFte, moeda, meses
    components/
      layout/Sidebar.vue    menu por seção, filtrado pelo papel; usuário e Sair
      BarraOpcoes.vue       ano · mês atual · unidade (liga na store de preferências)
    views/
      LoginView.vue
      DimensionamentoView.vue   Etapa 3: barra + bloco "Hoje"; Etapa 4: TabelaMeses, PorUnidade, Simulacao
      EmConstrucaoView.vue      placeholder dos cadastros (Etapa 4)
  src/style.css             Tailwind v4 + tokens da marca (@theme) + peças (.card, .stat, .table, .status…)
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

## Etapa 4 (próxima)

Componentes: `TabelaMeses.vue` (12 meses: vencem, pendente, hoje → ideal por área, conclusão, R$),
`PorUnidade.vue`, `Simulacao.vue` (E se…?), e as telas de cadastro (Unidades, Empresas por
Unidade com porte, Colaboradores com admissão/desligamento/custo, Funções, Calendário,
Histórico, Usuários). Depois: deploy do `web/` no Vercel no lugar do app atual.
