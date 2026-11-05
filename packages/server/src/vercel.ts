// Ponto de entrada da função serverless na Vercel (empacotado por scripts/build-vercel.mjs).
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   SUPABASE_URL         URL do projeto Supabase
//   SUPABASE_SECRET_KEY  chave secreta (sb_secret_… ou service_role). NUNCA expor no cliente.
import { createApi, type ApiHandler } from './api.ts';
import { SupabaseAuth } from './auth.ts';
import { nodeHandler } from './node.ts';
import { SupabaseStore } from './store/supabase.ts';

let api: ApiHandler | null = null;

function getApi(): ApiHandler | null {
  if (api) return api;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  api = createApi({ store: new SupabaseStore(url, key), auth: new SupabaseAuth(url, key) });
  return api;
}

export default nodeHandler(getApi);
