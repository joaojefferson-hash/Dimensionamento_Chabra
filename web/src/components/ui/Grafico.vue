<script setup>
/* Gráfico (Chart.js) reativo: recria quando os dados mudam. Marcas finas, pontas arredondadas,
   grade discreta, tooltip sempre ligado, legenda quando há mais de uma série. */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Chart, BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js';

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);
Chart.defaults.font.family = '"Inter", "Segoe UI", system-ui, sans-serif';
Chart.defaults.font.size = 12;
Chart.defaults.color = '#5f6b66';

const props = defineProps({
  type: { type: String, default: 'bar' },
  data: { type: Object, required: true },
  options: { type: Object, default: () => ({}) },
  height: { type: Number, default: 260 },
});

const canvas = ref(null);
let chart = null;

const base = () => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 250 },
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: (props.data.datasets || []).length > 1, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 14 } },
    tooltip: { backgroundColor: '#1f2a26', titleFont: { weight: '600' }, padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4 },
  },
  scales: {
    x: { grid: { display: false }, border: { color: '#dfe5e2' }, ticks: { color: '#5f6b66' } },
    y: { beginAtZero: true, grid: { color: '#eef1f0' }, border: { display: false }, ticks: { color: '#5f6b66', precision: 0 } },
  },
});
const fundir = (a, b) => {
  const out = { ...a };
  Object.entries(b || {}).forEach(([k, v]) => { out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? fundir(a[k], v) : v; });
  return out;
};
const montar = () => {
  if (chart) chart.destroy();
  chart = new Chart(canvas.value, { type: props.type, data: JSON.parse(JSON.stringify(props.data)), options: fundir(base(), props.options) });
};
onMounted(montar);
watch(() => [props.data, props.options, props.type], montar, { deep: true });
onBeforeUnmount(() => { if (chart) chart.destroy(); });
</script>

<template>
  <div :style="{ height: height + 'px', position: 'relative' }"><canvas ref="canvas"></canvas></div>
</template>
