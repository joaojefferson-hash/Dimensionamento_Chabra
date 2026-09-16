<script setup>
/* Organograma da equipe: indicadores, colaboradores por unidade e a árvore
   (chefias pela hierarquia das funções → equipes por unidade).
   Impressão: apenas o organograma, na folha escolhida, reduzido para caber. */
import { computed, ref, nextTick, onMounted, watch } from 'vue';
import Calculo from '../../engine/calculo.js';
import OrgChefe from './OrgChefe.vue';
import OrgEquipe from './OrgEquipe.vue';
import OrgPessoa from './OrgPessoa.vue';
import { useCadastrosStore } from '../../stores/cadastros.js';
import { montarOrganograma, pessoasPorUnidade } from '../../composables/organograma.js';
import { num, plural } from '../../composables/useFormat.js';

defineEmits(['editar']);
const cad = useCadastrosStore();
const TEC = Calculo.TEC, ADM = Calculo.ADM;

const org = computed(() => montarOrganograma({ unidades: cad.unidades, colaboradores: cad.colaboradoresCompletos, funcoes: cad.funcoes }));
const conta = f => cad.colaboradoresCompletos.filter(f).length;
const totalAlocado = c => (c.alocacoes || []).reduce((s, a) => s + Number(a.percentual || 0), 0);
const semUnidade = computed(() => conta(c => (c.tipoProducao !== 'nenhuma' || c.chefia) && totalAlocado(c) <= 0));

/* ---- barras de colaboradores por unidade ---- */
const barras = computed(() => {
  const linhas = pessoasPorUnidade({ unidades: cad.unidades, colaboradores: cad.colaboradoresCompletos });
  const max = Math.max(1, ...linhas.map(l => l.tec + l.adm));
  return linhas.map(l => ({ ...l, pctTec: (l.tec / max) * 100, pctAdm: (l.adm / max) * 100, total: l.tec + l.adm }));
});

/* ---- aviso de rolagem horizontal ---- */
const wrap = ref(null);
const rolaParaOLado = ref(false);
const medir = () => nextTick(() => { const el = wrap.value; rolaParaOLado.value = !!el && el.scrollWidth > el.clientWidth + 2; });
onMounted(medir);
watch(org, medir);

/* ---- impressão ---- */
const CHAVE_FOLHA = 'chabra-dimensiona:organograma-folha';
const folha = ref((() => { try { const v = localStorage.getItem(CHAVE_FOLHA); return ['portrait', 'landscape'].includes(v) ? v : 'auto'; } catch (_) { return 'auto'; } })());
watch(folha, v => { try { localStorage.setItem(CHAVE_FOLHA, v); } catch (_) { /* sem localStorage: apenas não memoriza */ } });
const arvore = ref(null);
const hoje = new Date().toLocaleDateString('pt-BR');

function imprimir() {
  const tree = arvore.value;
  if (!tree) return;
  // A4 menos 10 mm de margem de cada lado, em px de tela (96 dpi); o cabeçalho impresso ocupa ~40 px
  const PAGINA = { portrait: { w: 718, h: 1047 }, landscape: { w: 1047, h: 718 } };
  const CABECALHO = 40;
  const w = Math.max(1, tree.scrollWidth), h = Math.max(1, tree.scrollHeight);
  const cabeEm = o => Math.min(1, PAGINA[o].w / w, (PAGINA[o].h - CABECALHO) / h);
  const orientacao = folha.value === 'auto' ? (cabeEm('portrait') >= cabeEm('landscape') ? 'portrait' : 'landscape') : folha.value;
  let zoom = cabeEm(orientacao);
  if (zoom < 0.6) zoom = Math.min(1, PAGINA[orientacao].w / w); // grande demais para uma página: ajusta à largura e segue em mais páginas
  const estilo = document.createElement('style');
  estilo.textContent = `@page { size: A4 ${orientacao}; margin: 10mm; }`;
  document.head.appendChild(estilo);
  document.body.classList.add('imprimindo-organograma');
  tree.style.zoom = String(zoom);
  const limpar = () => {
    document.body.classList.remove('imprimindo-organograma');
    tree.style.zoom = '';
    estilo.remove();
    window.removeEventListener('afterprint', limpar);
  };
  window.addEventListener('afterprint', limpar);
  window.print();
  setTimeout(limpar, 2000); // navegadores sem afterprint (ou impressão cancelada)
}
</script>

<template>
  <div class="nao-imprimir mb-5 grid gap-3 md:grid-cols-5">
    <div class="stat row-ok"><div class="label">Colaboradores</div><div class="value">{{ cad.colaboradores.length }}</div></div>
    <div class="stat row-ok"><div class="label">Técnicos</div><div class="value">{{ conta(c => c.tipoProducao === TEC) }}</div></div>
    <div class="stat row-ok"><div class="label">Administrativos</div><div class="value">{{ conta(c => c.tipoProducao === ADM) }}</div></div>
    <div class="stat row-ok"><div class="label">Chefia</div><div class="value">{{ conta(c => c.chefia) }}</div></div>
    <div class="stat" :class="semUnidade ? 'row-deficit' : 'row-ok'"><div class="label">Sem unidade</div><div class="value" :class="semUnidade ? 'text-danger' : ''">{{ semUnidade }}</div></div>
  </div>

  <section v-if="cad.unidades.length" class="card nao-imprimir">
    <div class="card-head"><h2>Colaboradores por unidade</h2><span class="muted">{{ plural(cad.unidades.length, 'unidade', 'unidades') }}</span></div>
    <div class="org-barras">
      <div v-for="l in barras" :key="l.nome" class="org-barra-linha">
        <span class="org-barra-nome">{{ l.nome }}</span>
        <span class="org-barra">
          <span v-if="l.tec > 0" class="org-barra-seg seg-tec" :style="{ width: l.pctTec + '%' }" :title="`Técnicos: ${num(l.tec, 1)}`"></span>
          <span v-if="l.adm > 0" class="org-barra-seg seg-adm" :style="{ width: l.pctAdm + '%' }" :title="`Administrativos: ${num(l.adm, 1)}`"></span>
        </span>
        <span class="org-barra-total muted">{{ num(l.total, 1) }}<small v-if="l.chefia" title="Chefia na unidade"> ★{{ l.chefia }}</small></span>
      </div>
      <div class="org-legenda muted"><span><i class="seg-tec"></i>Técnicos</span><span><i class="seg-adm"></i>Administrativos</span><span>★ chefia na unidade</span> · em pessoas inteiras (o tempo parcial conta proporcionalmente; a chefia não integra a barra)</div>
    </div>
  </section>

  <section class="card card-organograma">
    <div class="card-head nao-imprimir">
      <h2>Organograma</h2>
      <div class="flex flex-wrap items-center gap-3 text-[12.5px]">
        <span class="muted">chefias pela hierarquia das funções → equipes por unidade</span>
        <label class="flex items-center gap-2" title="Orientação da folha na impressão">
          <span class="muted">Folha</span>
          <select v-model="folha" class="input input-sm"><option value="auto">Automática</option><option value="portrait">Retrato</option><option value="landscape">Paisagem</option></select>
        </label>
        <button class="btn btn-ghost !py-1.5" type="button" title="Imprimir ou salvar em PDF somente o organograma" @click="imprimir">Imprimir</button>
      </div>
    </div>

    <div class="print-only print-cabecalho">
      <strong>Organograma da equipe</strong>
      <span>Chabra Dimensiona · {{ hoje }} · {{ plural(cad.colaboradores.length, 'colaborador', 'colaboradores') }} em {{ plural(cad.unidades.length, 'unidade', 'unidades') }}</span>
    </div>

    <p v-if="!cad.unidades.length && !cad.colaboradores.length" class="muted">Cadastre unidades e colaboradores para visualizar o organograma.</p>
    <template v-else>
      <p v-if="rolaParaOLado" class="nao-imprimir muted mb-2 text-[12.5px]">A árvore é mais larga que a tela: role para o lado para visualizá-la por completo.</p>
      <div ref="wrap" class="org-wrap">
        <ul ref="arvore" class="org-tree">
          <li>
            <div class="org-node org-root">
              <div class="org-node-head"><strong>Equipe</strong><span class="muted">{{ plural(cad.colaboradores.length, 'pessoa', 'pessoas') }} · {{ plural(cad.unidades.length, 'unidade', 'unidades') }}</span></div>
              <span v-if="!org.totalChefes" class="org-vazio">Marque funções como chefia (tela Funções) para montar a hierarquia.</span>
            </div>
            <ul v-if="org.raizes.length || org.semChefia.length || org.semUnidade.length">
              <OrgChefe v-for="r in org.raizes" :key="r.id" :no="r" @editar="$emit('editar', $event)" />
              <li v-if="org.semChefia.length">
                <div class="org-node org-equipes org-sem-chefia">
                  <template v-if="org.totalChefes">
                    <div class="org-node-head"><strong>Sem chefia definida</strong></div>
                    <span class="org-vazio">Nenhuma chefia coordena essa área nessas unidades. Informe a unidade na chefia correspondente.</span>
                  </template>
                  <OrgEquipe v-for="e in org.semChefia" :key="e.unidadeId" :equipe="e" @editar="$emit('editar', $event)" />
                </div>
              </li>
              <li v-if="org.semUnidade.length">
                <div class="org-node org-sem-unidade">
                  <div class="org-node-head"><strong>Sem unidade</strong><span class="muted">{{ plural(org.semUnidade.length, 'pessoa', 'pessoas') }}</span></div>
                  <div class="org-secao"><OrgPessoa v-for="c in org.semUnidade" :key="c.id" :pessoa="c" @editar="$emit('editar', $event)" /></div>
                  <span class="org-vazio">Não são considerados na Projeção. Clique no nome e informe a unidade.</span>
                </div>
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
