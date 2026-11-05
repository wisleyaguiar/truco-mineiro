import { describe, expect, it } from 'vitest';
import { createRng, type Action } from '@truco/engine';
import { createApi, DevAuth, MemoryStore, type ApiRequest, type MatchPayload } from '../src/index.ts';

function setup(seed = 1) {
  const store = new MemoryStore();
  const api = createApi({ store, auth: new DevAuth(), rng: createRng(seed) });
  const call = async (method: string, path: string, opts: { user?: string; body?: unknown } = {}) => {
    const [p, q] = path.split('?');
    const req: ApiRequest = {
      method,
      path: p!,
      query: new URLSearchParams(q ?? ''),
      headers: opts.user ? { authorization: `Bearer dev:${opts.user}` } : {},
      body: opts.body ?? null,
    };
    return api(req);
  };
  return { store, call };
}

/** Joga como um humano simples: aceita truco, joga a Mão de 10 e joga a primeira carta. */
function pick(p: MatchPayload): Action {
  return p.legal.find((a) => a.type === 'accept' || a.type === 'mao10' || a.type === 'play') ?? p.legal[0]!;
}

/** Ids de cartas que aparecem em qualquer lugar do JSON. */
function cardIds(x: unknown): Set<string> {
  const out = new Set<string>();
  JSON.stringify(x, (_k, v) => {
    if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' && 'suit' in (v as object)) out.add((v as { id: string }).id);
    return v;
  });
  return out;
}

describe('API: login e perfil', () => {
  it('sem token → 401', async () => {
    const { call } = setup();
    expect((await call('GET', '/api/me')).status).toBe(401);
    expect((await call('POST', '/api/matches')).status).toBe(401);
  });

  it('token inválido → 401', async () => {
    const { call } = setup();
    const r = await call('GET', '/api/me', {});
    expect(r.status).toBe(401);
  });

  it('apelido: valida, salva e impede duplicado', async () => {
    const { call } = setup();
    expect((await call('PUT', '/api/me', { user: 'a@x.com', body: { nickname: 'x' } })).status).toBe(400);
    expect((await call('PUT', '/api/me', { user: 'a@x.com', body: { nickname: '<b>oi</b>' } })).status).toBe(400);
    expect((await call('PUT', '/api/me', { user: 'a@x.com', body: { nickname: '  Fulano  ' } })).status).toBe(200);
    const me = await call('GET', '/api/me', { user: 'a@x.com' });
    expect((me.body as { profile: { nickname: string } }).profile.nickname).toBe('Fulano');
    expect((await call('PUT', '/api/me', { user: 'b@x.com', body: { nickname: 'fulano' } })).status).toBe(409);
  });

  it('precisa de apelido para criar partida', async () => {
    const { call } = setup();
    const r = await call('POST', '/api/matches', { user: 'a@x.com', body: { mode: 'solo' } });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toBe('needs_nickname');
  });
});

describe('API: partida solo pelo servidor', () => {
  it('joga uma partida inteira e grava estatísticas e histórico', async () => {
    const { call } = setup(5);
    await call('PUT', '/api/me', { user: 'a@x.com', body: { nickname: 'Fulano' } });
    let r = await call('POST', '/api/matches', { user: 'a@x.com', body: { mode: 'solo' } });
    expect(r.status).toBe(201);
    let p = r.body as MatchPayload;
    expect(p.seat).toBe(0);
    expect(p.seats.map((s) => s.name)).toEqual(['Fulano', 'Zé do Blefe', 'Chico Mineiro', 'Tião Desconfiado']);
    expect(p.steps[0]!.events[0]!.event.type).toBe('hand_started');
    expect(p.steps[0]!.events[0]!.myHand).toHaveLength(3);

    let guard = 0;
    while (p.status === 'active') {
      expect(guard++).toBeLessThan(400);
      expect(p.waitingFor).toBe(0);
      r = await call('POST', `/api/matches/${p.matchId}/action`, { user: 'a@x.com', body: { action: pick(p), version: p.version } });
      expect(r.status).toBe(200);
      p = r.body as MatchPayload;
    }
    expect(p.status).toBe('finished');
    expect(p.waitingFor).toBeNull();
    expect(p.legal).toEqual([]);

    const me = (await call('GET', '/api/me', { user: 'a@x.com' })).body as { stats: { matchesPlayed: number }; activeMatchId: string | null };
    expect(me.stats.matchesPlayed).toBe(1);
    expect(me.activeMatchId).toBeNull();
    const h = (await call('GET', '/api/me/history', { user: 'a@x.com' })).body as { items: { won: boolean; partner: string }[] };
    expect(h.items).toHaveLength(1);
    expect(h.items[0]!.partner).toBe('Chico Mineiro');
  });

  it('nenhuma resposta revela cartas que o jogador ainda não pode ver', async () => {
    const { call, store } = setup(9);
    await call('PUT', '/api/me', { user: 'a@x.com', body: { nickname: 'Fulano' } });
    let p = (await call('POST', '/api/matches', { user: 'a@x.com', body: { mode: 'solo' } })).body as MatchPayload;
    let checkedDeals = 0;
    for (let i = 0; i < 60 && p.status === 'active'; i++) {
      const rec = (await store.getMatch(p.matchId))!;
      // 1) O campo secreto com as mãos de todos nunca sai do servidor.
      expect(JSON.stringify(p)).not.toContain('"dealt"');
      // 2) A visão atual só tem cartas de outros assentos se a regra permitir (parceiro na Mão de 10).
      const othersInHand = new Set(rec.state.hand.hands.flatMap((h, seat) => (seat === 0 ? [] : h.map((c) => c.id))));
      const allowed = new Set((p.view.partnerHand ?? []).map((c) => c.id));
      for (const id of cardIds(p.view)) if (!allowed.has(id)) expect(othersInHand.has(id)).toBe(false);
      if (p.view.partnerHand) {
        expect(rec.state.phase).toBe('mao_de_10_decision');
        expect(rec.state.hand.maoDe10Team).toBe(0);
      }
      // 3) Em cada distribuição deste passo, vem só a minha mão (3 cartas, ou nulls na Mão de Ferro cega).
      for (const s of p.steps) {
        for (const e of s.events) {
          if (e.event.type !== 'hand_started') continue;
          expect(e.myHand).toHaveLength(3);
          checkedDeals++;
        }
      }
      const r = await call('POST', `/api/matches/${p.matchId}/action`, { user: 'a@x.com', body: { action: pick(p), version: p.version } });
      p = r.body as MatchPayload;
    }
    expect(checkedDeals).toBeGreaterThan(1);
  });

  it('versão velha → 409 com a versão atual; jogada ilegal → 400', async () => {
    const { call } = setup(2);
    await call('PUT', '/api/me', { user: 'a@x.com', body: { nickname: 'Fulano' } });
    const p = (await call('POST', '/api/matches', { user: 'a@x.com', body: { mode: 'solo' } })).body as MatchPayload;
    const stale = await call('POST', `/api/matches/${p.matchId}/action`, { user: 'a@x.com', body: { action: pick(p), version: p.version - 1 } });
    expect(stale.status).toBe(409);
    expect((stale.body as { version: number }).version).toBe(p.version);
    const bad = await call('POST', `/api/matches/${p.matchId}/action`, { user: 'a@x.com', body: { action: { type: 'play', index: 9 }, version: p.version } });
    expect(bad.status).toBe(400);
    const junk = await call('POST', `/api/matches/${p.matchId}/action`, { user: 'a@x.com', body: { action: { type: 'hack' }, version: p.version } });
    expect(junk.status).toBe(400);
  });

  it('outra pessoa não acessa a partida (404)', async () => {
    const { call } = setup(3);
    await call('PUT', '/api/me', { user: 'a@x.com', body: { nickname: 'Fulano' } });
    const p = (await call('POST', '/api/matches', { user: 'a@x.com', body: { mode: 'solo' } })).body as MatchPayload;
    expect((await call('GET', `/api/matches/${p.matchId}`, { user: 'b@x.com' })).status).toBe(404);
    expect(
      (await call('POST', `/api/matches/${p.matchId}/action`, { user: 'b@x.com', body: { action: pick(p), version: p.version } })).status,
    ).toBe(404);
  });

  it('retomar: GET com since=0 devolve todos os passos; sem since, só o estado', async () => {
    const { call } = setup(4);
    await call('PUT', '/api/me', { user: 'a@x.com', body: { nickname: 'Fulano' } });
    let p = (await call('POST', '/api/matches', { user: 'a@x.com', body: { mode: 'solo' } })).body as MatchPayload;
    p = (await call('POST', `/api/matches/${p.matchId}/action`, { user: 'a@x.com', body: { action: pick(p), version: p.version } })).body as MatchPayload;
    const all = (await call('GET', `/api/matches/${p.matchId}?since=0`, { user: 'a@x.com' })).body as MatchPayload;
    expect(all.steps.map((s) => s.version)).toEqual([1, 2]);
    const now = (await call('GET', `/api/matches/${p.matchId}`, { user: 'a@x.com' })).body as MatchPayload;
    expect(now.steps).toEqual([]);
    expect(now.version).toBe(2);
    const me = (await call('GET', '/api/me', { user: 'a@x.com' })).body as { activeMatchId: string };
    expect(me.activeMatchId).toBe(p.matchId);
  });

  it('nova partida abandona a anterior (só uma ativa por jogador)', async () => {
    const { call } = setup(6);
    await call('PUT', '/api/me', { user: 'a@x.com', body: { nickname: 'Fulano' } });
    const a = (await call('POST', '/api/matches', { user: 'a@x.com', body: { mode: 'solo' } })).body as MatchPayload;
    const b = (await call('POST', '/api/matches', { user: 'a@x.com', body: { mode: 'solo' } })).body as MatchPayload;
    const oldOne = (await call('GET', `/api/matches/${a.matchId}`, { user: 'a@x.com' })).body as MatchPayload;
    expect(oldOne.status).toBe('abandoned');
    const r = await call('POST', `/api/matches/${a.matchId}/action`, {
      user: 'a@x.com',
      body: { action: { type: 'play', index: 0 }, version: oldOne.version },
    });
    expect(r.status).toBe(409);
    expect(b.status).toBe('active');
  });

  it('rota desconhecida → 404; método errado → 405', async () => {
    const { call } = setup();
    expect((await call('GET', '/api/nada')).status).toBe(404);
    expect((await call('DELETE', '/api/me', { user: 'a@x.com' })).status).toBe(405);
  });
});
