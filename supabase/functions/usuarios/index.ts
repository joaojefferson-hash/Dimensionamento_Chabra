// ============================================================================
// Edge Function `usuarios` — gestão de usuários pelo administrador
//
// Chamada pelo app com o JWT do usuário logado (supabase.functions.invoke).
// - O gateway já exige um JWT válido (verify_jwt = true).
// - Aqui conferimos QUEM é o chamador e exigimos app_metadata.admin === true
//   (app_metadata não é editável pelo próprio usuário, ao contrário de
//   user_metadata).
// - Só então usamos a chave secreta (lida do ambiente da função, nunca vai ao
//   navegador) para as operações auth.admin.*.
//
// Ações (body JSON { action, ...params }):
//   listar                       → { usuarios: [...] }
//   criar          { nome, sobrenome, email, senha, admin }
//   editar         { id, nome, sobrenome }        (dados de exibição, em user_metadata)
//   redefinirSenha { id, senha }
//   definirAdmin   { id, admin }
//   remover        { id }
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SENHA_MIN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function secretKey(): string {
  const novo = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (novo) {
    try {
      const keys = JSON.parse(novo);
      if (keys && keys.default) return keys.default;
    } catch (_) { /* cai no legado */ }
  }
  const legado = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!legado) throw new Error('Chave secreta não configurada no ambiente da função.');
  return legado;
}

// Mensagens amigáveis para os erros mais comuns do Auth
function traduz(msg: string): string {
  if (/already (been )?registered|already exists/i.test(msg)) return 'Já existe um usuário com esse e-mail.';
  if (/password should be at least|weak password|password is too short/i.test(msg)) return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  if (/invalid.*email|email.*invalid/i.test(msg)) return 'E-mail inválido.';
  if (/not found/i.test(msg)) return 'Usuário não encontrado.';
  return msg;
}

type Usuario = {
  id: string;
  email: string | null;
  nome: string;
  sobrenome: string;
  nomeCompleto: string;
  admin: boolean;
  confirmado: boolean;
  criadoEm: string;
  ultimoLogin: string | null;
};

const NOME_MAX = 60;
const limpaNome = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, NOME_MAX);

function mapUser(u: { id: string; email?: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown>; email_confirmed_at?: string | null; created_at: string; last_sign_in_at?: string | null }): Usuario {
  const nome = limpaNome(u.user_metadata?.nome);
  const sobrenome = limpaNome(u.user_metadata?.sobrenome);
  return {
    id: u.id,
    email: u.email ?? null,
    nome,
    sobrenome,
    nomeCompleto: [nome, sobrenome].filter(Boolean).join(' ') || (u.email ?? ''),
    admin: u.app_metadata?.admin === true,
    confirmado: !!u.email_confirmed_at,
    criadoEm: u.created_at,
    ultimoLogin: u.last_sign_in_at ?? null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, secretKey(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // ---- quem está chamando? ----
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'Não autenticado' }, 401);
    const { data: { user: chamador }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !chamador) return json({ error: 'Sessão inválida ou expirada' }, 401);
    if (chamador.app_metadata?.admin !== true) return json({ error: 'Apenas administradores podem gerenciar usuários.' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');

    // helper: lista completa (o app é pequeno; paginação de 1000 basta)
    async function listar(): Promise<Usuario[]> {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw new Error(traduz(error.message));
      return data.users
        .map(mapUser)
        .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR', { sensitivity: 'base' }));
    }

    switch (action) {
      case 'listar': {
        return json({ usuarios: await listar() });
      }

      case 'criar': {
        const nome = limpaNome(body.nome);
        const sobrenome = limpaNome(body.sobrenome);
        const email = String(body.email ?? '').trim().toLowerCase();
        const senha = String(body.senha ?? '');
        const ehAdmin = body.admin === true;
        if (!nome) return json({ error: 'Informe o nome.' }, 400);
        if (!EMAIL_RE.test(email)) return json({ error: 'E-mail inválido.' }, 400);
        if (senha.length < SENHA_MIN) return json({ error: `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.` }, 400);
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: senha,
          email_confirm: true,
          user_metadata: { nome, sobrenome },
          app_metadata: { admin: ehAdmin },
        });
        if (error) return json({ error: traduz(error.message) }, error.status === 422 ? 409 : 400);
        return json({ usuario: mapUser(data.user) }, 201);
      }

      case 'editar': {
        const id = String(body.id ?? '');
        const nome = limpaNome(body.nome);
        const sobrenome = limpaNome(body.sobrenome);
        if (!id) return json({ error: 'Usuário não informado.' }, 400);
        if (!nome) return json({ error: 'Informe o nome.' }, 400);
        const { data: alvo, error: getErr } = await admin.auth.admin.getUserById(id);
        if (getErr || !alvo.user) return json({ error: 'Usuário não encontrado.' }, 404);
        const { data, error } = await admin.auth.admin.updateUserById(id, {
          user_metadata: { ...(alvo.user.user_metadata ?? {}), nome, sobrenome },
        });
        if (error) return json({ error: traduz(error.message) }, 400);
        return json({ usuario: mapUser(data.user) });
      }

      case 'redefinirSenha': {
        const id = String(body.id ?? '');
        const senha = String(body.senha ?? '');
        if (!id) return json({ error: 'Usuário não informado.' }, 400);
        if (senha.length < SENHA_MIN) return json({ error: `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.` }, 400);
        const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
        if (error) return json({ error: traduz(error.message) }, 400);
        return json({ ok: true });
      }

      case 'definirAdmin': {
        const id = String(body.id ?? '');
        const ehAdmin = body.admin === true;
        if (!id) return json({ error: 'Usuário não informado.' }, 400);
        if (id === chamador.id) return json({ error: 'Você não pode alterar o seu próprio papel.' }, 400);
        const { data: alvo, error: getErr } = await admin.auth.admin.getUserById(id);
        if (getErr || !alvo.user) return json({ error: 'Usuário não encontrado.' }, 404);
        if (!ehAdmin) {
          const admins = (await listar()).filter(u => u.admin);
          if (admins.length <= 1 && admins.some(u => u.id === id)) {
            return json({ error: 'Não é possível remover o último administrador.' }, 400);
          }
        }
        const { error } = await admin.auth.admin.updateUserById(id, {
          app_metadata: { ...(alvo.user.app_metadata ?? {}), admin: ehAdmin },
        });
        if (error) return json({ error: traduz(error.message) }, 400);
        return json({ ok: true });
      }

      case 'remover': {
        const id = String(body.id ?? '');
        if (!id) return json({ error: 'Usuário não informado.' }, 400);
        if (id === chamador.id) return json({ error: 'Você não pode remover a si mesmo.' }, 400);
        const usuarios = await listar();
        const alvo = usuarios.find(u => u.id === id);
        if (!alvo) return json({ error: 'Usuário não encontrado.' }, 404);
        if (alvo.admin && usuarios.filter(u => u.admin).length <= 1) {
          return json({ error: 'Não é possível remover o último administrador.' }, 400);
        }
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) return json({ error: traduz(error.message) }, 400);
        return json({ ok: true });
      }

      default:
        return json({ error: `Ação desconhecida: ${action || '(vazia)'}` }, 400);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[usuarios]', msg);
    return json({ error: 'Erro interno: ' + msg }, 500);
  }
});
