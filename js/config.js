/* ==========================================================================
   Configuração do projeto Supabase.

   A chave PUBLISHABLE é pública por design (vai para o navegador de qualquer
   forma); o que protege os dados é o login + RLS. Nunca coloque aqui a chave
   secret / service_role.

   Onde pegar: Dashboard → Project Settings → API Keys → "Publishable key"
   (formato sb_publishable_…).
   ========================================================================== */

const CONFIG = {
  SUPABASE_URL: 'https://wdlxpbusyuieftnxemot.supabase.co',
  SUPABASE_KEY: 'COLE_AQUI_A_CHAVE_PUBLISHABLE',
};
