/* ==========================================================================
   Auth — sessão Supabase (e-mail/senha) e cliente `db` usado pelo Store

   Usuários são criados pelo admin no dashboard do Supabase; não há cadastro
   público no app.
   ========================================================================== */

const db = window.supabase
  ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY)
  : null;

const Auth = (() => {
  let session = null;
  const listeners = [];

  /** Verifica se a configuração mínima está preenchida. */
  function configOk() {
    return !!db
      && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(CONFIG.SUPABASE_URL || '')
      && !!CONFIG.SUPABASE_KEY
      && !/COLE_AQUI/i.test(CONFIG.SUPABASE_KEY);
  }

  /** Recupera a sessão salva e passa a observar login/logout. Retorna a sessão atual (ou null). */
  async function init() {
    const { data } = await db.auth.getSession();
    session = data.session || null;

    db.auth.onAuthStateChange((event, novaSessao) => {
      session = novaSessao || null;
      // Só avisa a app em mudanças de identidade — TOKEN_REFRESHED/INITIAL_SESSION são silenciosos.
      // O despacho é adiado (setTimeout 0) porque, dentro deste callback, chamar outros métodos
      // do supabase-js pode travar ou sair sem o token da sessão (recomendação da própria lib).
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        const s = session;
        setTimeout(() => listeners.forEach(fn => fn(s, event)), 0);
      }
    });

    return session;
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  async function signIn(email, password) {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw new Error(traduzErro(error));
  }

  async function signOut() {
    const { error } = await db.auth.signOut();
    if (error) throw new Error(traduzErro(error));
  }

  function user() {
    return session ? session.user : null;
  }

  /** Administrador = app_metadata.admin === true (definido só pelo servidor; o usuário não edita). */
  function isAdmin() {
    const u = user();
    return !!(u && u.app_metadata && u.app_metadata.admin === true);
  }

  /** Troca a senha do usuário logado. */
  async function alterarSenha(novaSenha) {
    const { error } = await db.auth.updateUser({ password: novaSenha });
    if (error) throw new Error(traduzErro(error));
  }

  function traduzErro(error) {
    const msg = String((error && error.message) || '');
    if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha inválidos.';
    if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado. Peça ao administrador para confirmar o usuário.';
    if (/rate limit|too many requests/i.test(msg)) return 'Muitas tentativas. Aguarde um instante e tente de novo.';
    if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet.';
    if (/invalid api key|apikey/i.test(msg)) return 'Chave do Supabase inválida. Confira js/config.js.';
    if (/password should be at least|weak password/i.test(msg)) return 'A senha precisa ter pelo menos 8 caracteres.';
    if (/same.*password|different from the old/i.test(msg)) return 'A nova senha precisa ser diferente da atual.';
    return msg || 'Falha na autenticação.';
  }

  return {
    configOk, init, onChange, signIn, signOut, user, isAdmin, alterarSenha,
    get session() { return session; },
  };
})();
