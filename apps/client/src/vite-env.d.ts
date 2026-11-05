/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL do projeto Supabase (pública). */
  readonly VITE_SUPABASE_URL?: string;
  /** Chave pública do Supabase (publishable / anon). Nunca a chave secreta. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Só em desenvolvimento: "1" ativa login sem e-mail contra a API local em memória. */
  readonly VITE_DEV_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
