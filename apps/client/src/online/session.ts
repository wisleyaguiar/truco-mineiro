// Sessão do jogador online: login por e-mail (link mágico + código de 6 dígitos) via Supabase Auth.
// Em desenvolvimento (DEV_AUTH), entra direto com o e-mail, sem enviar nada.
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEV_AUTH, SUPABASE_KEY, SUPABASE_URL } from './config.ts';

const DEV_KEY = 'truco.devAuthEmail';

export interface Session {
  email: string | null;
  /** Token para o header Authorization da API (null = deslogado). */
  token(): Promise<string | null>;
  sendLink(email: string): Promise<{ ok: true; instant?: boolean } | { ok: false; error: string }>;
  verifyCode(email: string, code: string): Promise<{ ok: true } | { ok: false; error: string }>;
  signOut(): Promise<void>;
  /** Avisa quando a sessão muda (ex.: voltou do link do e-mail). */
  onChange(cb: () => void): void;
}

function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* sem storage: sessão só nesta aba */
  }
}

class DevSession implements Session {
  email: string | null = safeGet(DEV_KEY);
  private listeners: (() => void)[] = [];
  async token() {
    return this.email ? `dev:${this.email}` : null;
  }
  async sendLink(email: string) {
    this.email = email.trim().toLowerCase();
    safeSet(DEV_KEY, this.email);
    this.listeners.forEach((l) => l());
    return { ok: true as const, instant: true };
  }
  async verifyCode() {
    return { ok: true as const };
  }
  async signOut() {
    this.email = null;
    safeSet(DEV_KEY, null);
    this.listeners.forEach((l) => l());
  }
  onChange(cb: () => void) {
    this.listeners.push(cb);
  }
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('rate limit') || m.includes('security purposes')) return 'Muitas tentativas. Espere um minuto e tente de novo.';
  if (m.includes('expired') || m.includes('invalid')) return 'Código inválido ou expirado. Peça um novo.';
  if (m.includes('email')) return 'Confira o e-mail digitado.';
  return 'Não deu certo agora. Tente de novo.';
}

class SupabaseSession implements Session {
  email: string | null = null;
  private constructor(private client: SupabaseClient) {}

  static async create(): Promise<SupabaseSession> {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    });
    const s = new SupabaseSession(client);
    const { data } = await client.auth.getSession();
    s.email = data.session?.user.email ?? null;
    return s;
  }

  async token() {
    const { data } = await this.client.auth.getSession();
    this.email = data.session?.user.email ?? null;
    return data.session?.access_token ?? null;
  }

  async sendLink(email: string) {
    const { error } = await this.client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true },
    });
    return error ? { ok: false as const, error: friendly(error.message) } : { ok: true as const };
  }

  async verifyCode(email: string, code: string) {
    const { error } = await this.client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    return error ? { ok: false as const, error: friendly(error.message) } : { ok: true as const };
  }

  async signOut() {
    await this.client.auth.signOut();
    this.email = null;
  }

  onChange(cb: () => void) {
    this.client.auth.onAuthStateChange((_event, session) => {
      this.email = session?.user.email ?? null;
      // limpa ?code=... da URL depois do login pelo link
      if (location.search.includes('code=')) history.replaceState(null, '', location.pathname);
      cb();
    });
  }
}

let current: Promise<Session> | null = null;

export function getSession(): Promise<Session> {
  current ??= DEV_AUTH ? Promise.resolve(new DevSession()) : SupabaseSession.create();
  return current;
}
