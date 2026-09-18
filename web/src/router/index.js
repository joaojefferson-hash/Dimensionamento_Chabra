/* ==========================================================================
   Rotas. Cada tela declara os papéis que a veem (meta.papeis); sem lista = todos.
   Guard: sem sessão → /entrar; sem permissão → primeira tela permitida.
   ========================================================================== */
import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

export const TELAS = [
  { path: '/diretoria',       name: 'diretoria',       titulo: 'Diretoria',       secao: 'Dimensionamento', papeis: ['admin', 'leitura'], component: () => import('../views/DiretoriaView.vue') },
  { path: '/projecao',        name: 'projecao',        titulo: 'Projeção',        secao: 'Dimensionamento', papeis: ['admin', 'leitura'], component: () => import('../views/DimensionamentoView.vue') },
  { path: '/mes',             name: 'mes',             titulo: 'Resumo do mês',   secao: 'Dimensionamento', papeis: ['admin', 'leitura'], component: () => import('../views/MesView.vue') },
  { path: '/dashboard',       name: 'dashboard',       titulo: 'Dashboard',       secao: 'Dimensionamento', papeis: ['admin', 'leitura'], component: () => import('../views/DashboardView.vue') },
  { path: '/evolucao',        name: 'evolucao',        titulo: 'Evolução',        secao: 'Dimensionamento', papeis: ['admin', 'leitura'], component: () => import('../views/EvolucaoView.vue') },
  { path: '/unidades',        name: 'unidades',        titulo: 'Unidades',            secao: 'Cadastros', component: () => import('../views/UnidadesView.vue') },
  { path: '/empresas',        name: 'empresas',        titulo: 'Empresas por Unidade', secao: 'Cadastros', component: () => import('../views/EmpresasView.vue') },
  { path: '/colaboradores',   name: 'colaboradores',   titulo: 'Colaboradores',       secao: 'Cadastros', component: () => import('../views/ColaboradoresView.vue') },
  { path: '/funcoes',         name: 'funcoes',         titulo: 'Funções',             secao: 'Cadastros', component: () => import('../views/FuncoesView.vue') },
  { path: '/calendario',      name: 'calendario',      titulo: 'Calendário',          secao: 'Cadastros', component: () => import('../views/CalendarioView.vue') },
  { path: '/historico',       name: 'historico',       titulo: 'Histórico',           secao: 'Acompanhamento', component: () => import('../views/HistoricoView.vue') },
  { path: '/usuarios',        name: 'usuarios',        titulo: 'Usuários',            secao: 'Administração', papeis: ['admin'], component: () => import('../views/UsuariosView.vue') },
];

export const podeVer = (tela, papel) => !tela.papeis || tela.papeis.includes(papel);

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/entrar', name: 'entrar', component: () => import('../views/LoginView.vue'), meta: { publica: true } },
    ...TELAS.map(t => ({ path: t.path, name: t.name, component: t.component, meta: { titulo: t.titulo, papeis: t.papeis } })),
    { path: '/dimensionamento', redirect: '/projecao' }, // links antigos
    { path: '/:resto(.*)', redirect: '/projecao' },
  ],
});

router.beforeEach(async to => {
  const auth = useAuthStore();
  if (!auth.pronto) await auth.iniciar();
  if (to.meta.publica) return auth.logado ? { name: 'projecao' } : true;
  if (!auth.logado) return { name: 'entrar' };
  const tela = TELAS.find(t => t.name === to.name);
  if (tela && !podeVer(tela, auth.papel)) {
    const primeira = TELAS.find(t => podeVer(t, auth.papel));
    return primeira ? { name: primeira.name } : { name: 'entrar' };
  }
  return true;
});

router.afterEach(to => { document.title = `${to.meta.titulo || 'Entrar'} · Chabra Dimensiona`; });

export default router;
