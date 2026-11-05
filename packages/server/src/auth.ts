import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface Auth {
  /** Valida o token (Bearer) e devolve o usuário, ou null se inválido/expirado. */
  verify(token: string): Promise<AuthUser | null>;
}

/** Produção: valida o token de sessão no Supabase Auth. */
export class SupabaseAuth implements Auth {
  private client;
  constructor(url: string, secretKey: string) {
    this.client = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  async verify(token: string): Promise<AuthUser | null> {
    if (!token || token.length > 4096) return null;
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  }
}

/**
 * SÓ PARA DESENVOLVIMENTO LOCAL E TESTES: token "dev:<email>" vira um usuário fixo.
 * Nunca é usado no build da Vercel (lá só existe SupabaseAuth).
 */
export class DevAuth implements Auth {
  async verify(token: string): Promise<AuthUser | null> {
    if (!token.startsWith('dev:')) return null;
    const email = token.slice(4).trim().toLowerCase();
    if (!email) return null;
    const h = createHash('sha256').update(email).digest('hex');
    const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
    return { id, email };
  }
}
