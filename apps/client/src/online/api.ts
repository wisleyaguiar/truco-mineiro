// Cliente HTTP da API do jogo (/api/*). Os tipos de resposta vêm do pacote do servidor.
import type { Action } from '@truco/engine';
import type { HistoryItem, MatchPayload, Profile, Stats } from '@truco/server/types';
import type { Session } from './session.ts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface Me {
  user: { id: string; email: string | null };
  profile: Profile | null;
  stats: Stats;
  activeMatchId: string | null;
}

export class OnlineApi {
  constructor(private session: Session) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.session.token();
    if (!token) throw new ApiError(401, 'unauthorized', 'Faça login para jogar online.');
    let res: Response;
    try {
      res = await fetch(path, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, 'network', 'Sem conexão com o servidor. Confira sua internet.');
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new ApiError(res.status, String(data.error ?? 'error'), String(data.message ?? 'Erro no servidor.'), data);
    return data as T;
  }

  me() {
    return this.call<Me>('GET', '/api/me');
  }
  setNickname(nickname: string) {
    return this.call<{ profile: Profile }>('PUT', '/api/me', { nickname });
  }
  history(limit = 20) {
    return this.call<{ items: HistoryItem[] }>('GET', `/api/me/history?limit=${limit}`);
  }
  createSolo() {
    return this.call<MatchPayload>('POST', '/api/matches', { mode: 'solo' });
  }
  match(id: string, since?: number) {
    return this.call<MatchPayload>('GET', `/api/matches/${encodeURIComponent(id)}${since !== undefined ? `?since=${since}` : ''}`);
  }
  act(id: string, action: Action, version: number) {
    return this.call<MatchPayload>('POST', `/api/matches/${encodeURIComponent(id)}/action`, { action, version });
  }
}
