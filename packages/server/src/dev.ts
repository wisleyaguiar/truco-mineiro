// Servidor de API para desenvolvimento local (npm run dev:api).
// Sem chaves do Supabase: usa store em memória + login de desenvolvimento ("dev:<email>").
// Com SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente: usa o Supabase de verdade.
import { createServer } from 'node:http';
import { createApi } from './api.ts';
import { DevAuth, SupabaseAuth } from './auth.ts';
import { nodeHandler } from './node.ts';
import { MemoryStore } from './store/memory.ts';
import { SupabaseStore } from './store/supabase.ts';

const port = Number(process.env.API_PORT ?? 8787);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const real = Boolean(url && key);
const api = real
  ? createApi({ store: new SupabaseStore(url!, key!), auth: new SupabaseAuth(url!, key!) })
  : createApi({ store: new MemoryStore(), auth: new DevAuth() });

createServer(nodeHandler(() => api)).listen(port, () => {
  console.log(`API de desenvolvimento em http://localhost:${port} (${real ? 'Supabase' : 'memória + login dev'})`);
});
