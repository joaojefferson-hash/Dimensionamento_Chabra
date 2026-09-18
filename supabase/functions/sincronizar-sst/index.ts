/* ==========================================================================
   sincronizar-sst — busca os documentos na API da Chabra e grava demanda e
   atendidas no Chabra Dimensiona.

   Roda no servidor: as credenciais da API (Cloudflare Access + JWT) ficam como
   segredos da função e nunca chegam ao navegador.

   Entrada (POST, JSON):
     { "ano": 2026, "aplicar": true }     aplicar=false → só devolve a prévia (nada é gravado)
   Quem pode chamar: administrador autenticado do Dimensiona (ou o agendamento diário).

   Ordem: /sincronizacao → decide por unidade (cobertura) → /documentos paginado →
   transformar.js → RPC aplicar_sincronizacao_sst.
   ========================================================================== */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { montarLote } from './transformar.js';

const API = Deno.env.get('CHABRA_API_BASE') ?? 'https://api.chabra.com.br/v1';
const CF_ID = Deno.env.get('CHABRA_CF_ID') ?? '';
const CF_SECRET = Deno.env.get('CHABRA_CF_SECRET') ?? '';
const JWT = Deno.env.get('CHABRA_JWT') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

const cabecalhos = {
  'CF-Access-Client-Id': CF_ID,
  'CF-Access-Client-Secret': CF_SECRET,
  Authorization: `Bearer ${JWT}`,
  Accept: 'application/json',
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret' } });

/** GET na API com retentativa em 429 e parada imediata em 401 (credencial recusada). */
async function apiGet(caminho: string, params: Record<string, string>, tentativa = 0): Promise<any[]> {
  const url = `${API}/${caminho}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: cabecalhos });
  if (res.status === 429 && tentativa < 5) {
    const espera = (Number(res.headers.get('retry-after') ?? '1') || 1) * 1000 * 2 ** tentativa;
    await new Promise(r => setTimeout(r, espera));
    return apiGet(caminho, params, tentativa + 1);
  }
  if (res.status === 401) throw new Error('A API recusou a credencial (401). Verifique o token e avise a TI — não vamos repetir a chamada.');
  if (res.status === 403 || res.status === 302) throw new Error('A borda (Cloudflare Access) recusou a chamada: confira CHABRA_CF_ID e CHABRA_CF_SECRET.');
  if (!res.ok) throw new Error(`API respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return await res.json();
}

/** Pagina até esgotar (teto de 1.000 por resposta), sempre com ordenação determinística. */
async function apiTodos(caminho: string, params: Record<string, string>): Promise<any[]> {
  const saida: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const pagina = await apiGet(caminho, { ...params, order: params.order ?? 'id', limit: '1000', offset: String(offset) });
    saida.push(...pagina);
    if (pagina.length < 1000) return saida;
    if (offset > 200000) return saida; // guarda contra laço infinito
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 204);
  if (req.method !== 'POST') return json({ message: 'Use POST.' }, 405);

  const corpo = await req.json().catch(() => ({}));
  const ano = Number(corpo.ano) || new Date().getFullYear();
  const aplicar = corpo.aplicar !== false;
  const autorizacao = req.headers.get('Authorization') ?? '';
  const doCron = CRON_SECRET && req.headers.get('x-cron-secret') === CRON_SECRET;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  // quem chamou: agendamento (segredo) ou administrador autenticado
  if (!doCron) {
    const token = autorizacao.replace(/^Bearer\s+/i, '');
    if (!token) return json({ message: 'Não autenticado.' }, 401);
    const { data: usuario, error } = await admin.auth.getUser(token);
    if (error || !usuario?.user) return json({ message: 'Sessão inválida.' }, 401);
    const meta = (usuario.user.app_metadata ?? {}) as Record<string, unknown>;
    const papel = meta.papel ?? (meta.admin === true ? 'admin' : null);
    if (papel !== 'admin') return json({ message: 'Só administradores podem sincronizar.' }, 403);
  }

  // só depois de identificar quem chamou: o estado das credenciais da API não é informação pública
  if (!CF_ID || !CF_SECRET || !JWT) {
    return json({ message: 'Credenciais da API não configuradas. Defina CHABRA_CF_ID, CHABRA_CF_SECRET e CHABRA_JWT nos segredos da função.' }, 503);
  }

  try {
    const { data: unidades, error: erroUnidades } = await admin.from('unidades').select('id, nome, codigo_api');
    if (erroUnidades) throw new Error(`Não foi possível ler as unidades: ${erroUnidades.message}`);
    const { data: clientes } = await admin.from('clientes_porte').select('codigo, cnpj, porte, condicao');

    const classificacao = { porCnpj: {} as Record<string, unknown>, porCodigo: {} as Record<string, unknown> };
    (clientes ?? []).forEach((c: any) => {
      const dado = { porte: c.porte, condicao: c.condicao };
      if (c.cnpj) classificacao.porCnpj[String(c.cnpj).replace(/\D+/g, '')] = dado;
      if (c.codigo) classificacao.porCodigo[String(c.codigo)] = dado;
    });

    const cobertura = await apiGet('sincronizacao', { select: 'unidade,cobertura,ultima_varredura_em,status_varredura,documentos_sst,cobertura_motivo' });
    const utilizaveis = cobertura.filter((c: any) => ['ok', 'parcial', 'desatualizado'].includes(c.cobertura)).map((c: any) => c.unidade);

    let documentos: any[] = [];
    if (utilizaveis.length) {
      // vencimentos do ano (documento corrente) + emissões do ano (inclusive substituídos)
      const campos = 'id,unidade,tipo,numero,emitido_em,vence_em,vigente,estado,empresa_id,empresa_cnpj,empresa_razao_social';
      const filtroUnidade = `in.(${utilizaveis.join(',')})`;
      const vencendo = await apiTodos('documentos', {
        unidade: filtroUnidade, vigente: 'is.true',
        vence_em: `gte.${ano}-01-01`, and: `(vence_em.lte.${ano}-12-31)`,
        select: campos,
      });
      const emitidos = await apiTodos('documentos', {
        unidade: filtroUnidade,
        emitido_em: `gte.${ano}-01-01`, and: `(emitido_em.lte.${ano}-12-31)`,
        select: campos,
      });
      const porId = new Map<string, any>();
      [...vencendo, ...emitidos].forEach(d => porId.set(String(d.id), d));
      documentos = [...porId.values()];
    }

    const lote = montarLote({ ano, cobertura, documentos, unidades: unidades ?? [], classificacao });

    if (!aplicar) return json({ previa: true, ...lote });

    const { error: erroRpc } = await admin.rpc('aplicar_sincronizacao_sst', {
      p_payload: {
        ano,
        unidades: lote.unidades.map(u => ({
          unidade_id: u.unidade_id, codigo_api: u.codigo_api, cobertura: u.cobertura,
          ultima_varredura_em: u.ultima_varredura_em, documentos: u.documentos,
          aplicar: u.aplicar, mensagem: u.mensagem, demanda: u.demanda, atendidas: u.atendidas,
        })),
      },
    });
    if (erroRpc) throw new Error(`Falha ao gravar: ${erroRpc.message}`);

    return json({
      aplicado: true, ano,
      resumo: lote.resumo,
      unidades: lote.unidades.map(u => ({ codigo_api: u.codigo_api, unidade: u.unidade_nome, cobertura: u.cobertura, aplicar: u.aplicar, demanda: u.totalDemanda, atendidas: u.totalAtendidas, mensagem: u.mensagem })),
      naoClassificados: lote.naoClassificados.slice(0, 200),
    });
  } catch (e) {
    return json({ message: e instanceof Error ? e.message : String(e) }, 502);
  }
});
