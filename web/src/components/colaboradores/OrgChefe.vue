<script setup>
/* Um nó de chefia do organograma (componente recursivo): a chefia, as chefias
   subordinadas e, abaixo, as equipes das unidades que ela coordena. */
import { computed } from 'vue';
import OrgPessoa from './OrgPessoa.vue';
import OrgEquipe from './OrgEquipe.vue';
import { COORDENA_TXT } from '../../composables/organograma.js';

const props = defineProps({ no: { type: Object, required: true } });
defineEmits(['editar']);

const onde = computed(() => {
  const n = props.no.unidades;
  if (!n.length) return 'nenhuma unidade informada';
  if (props.no.todasAsUnidades) return 'todas as unidades';
  return n.length > 3 ? `${n.slice(0, 3).join(', ')} +${n.length - 3}` : n.join(', ');
});
</script>

<template>
  <li>
    <div class="org-node org-chefe">
      <OrgPessoa :pessoa="no.pessoa" chefia @editar="$emit('editar', $event)" />
      <div class="org-meta">{{ COORDENA_TXT[no.coordena] || COORDENA_TXT.todos }} · <span :class="no.unidades.length ? '' : 'org-alerta'">{{ onde }}</span></div>
    </div>
    <ul v-if="no.filhos.length || no.equipes.length">
      <OrgChefe v-for="f in no.filhos" :key="f.id" :no="f" @editar="$emit('editar', $event)" />
      <li v-if="no.equipes.length">
        <div class="org-node org-equipes">
          <OrgEquipe v-for="e in no.equipes" :key="e.unidadeId" :equipe="e" @editar="$emit('editar', $event)" />
        </div>
      </li>
    </ul>
  </li>
</template>
