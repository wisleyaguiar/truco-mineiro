// Configuração do modo online (variáveis VITE_* definidas na Vercel / .env.local).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
/** Login de desenvolvimento: só funciona no `npm run dev` (nunca no build de produção). */
export const DEV_AUTH = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === '1';
export const ONLINE_ENABLED = DEV_AUTH || Boolean(SUPABASE_URL && SUPABASE_KEY);
