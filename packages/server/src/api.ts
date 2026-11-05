// API do jogo online, sem framework: recebe uma requisição simples e devolve status + JSON.
// O servidor é a autoridade: embaralha, valida as jogadas, joga pelos bots e só revela a cada
// jogador o que ele pode ver.
import {
  createDeck,
  createMatch,
  getLegalActions,
  getPlayerView,
  secureShuffle,
  type Action,
  type MatchState,
  type Seat,
} from '@truco/engine';
import { applyHumanAction, dealtViews, humanToAct, runBots, type TableSeats, type TimedEvent } from '@truco/bots';
import type { Auth, AuthUser } from './auth.ts';
import type { Store } from './store/store.ts';
import type { ClientStep, FinishInfo, MatchPayload, MatchRecord, SeatInfo, StepPayload } from './types.ts';

export interface ApiRequest {
  method: string;
  /** Caminho sem query, ex.: /api/matches/123/action */
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | undefined>;
  body: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface ApiDeps {
  store: Store;
  auth: Auth;
  /** Baralho de cada mão. Padrão: embaralhamento criptográfico. Testes podem fixar. */
  deck?: () => ReturnType<typeof createDeck>;
  rng?: () => number;
}

const BOTS: Omit<SeatInfo, 'userId'>[] = [
  { seat: 1, isBot: true, personality: 'blefe', name: 'Zé do Blefe' },
  { seat: 2, isBot: true, personality: 'equilibrado', name: 'Chico Mineiro' },
  { seat: 3, isBot: true, personality: 'desconfiado', name: 'Tião Desconfiado' },
];

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

const json = (status: number, body: unknown): ApiResponse => ({ status, body });

export function validateNickname(raw: unknown): string {
  if (typeof raw !== 'string') throw new HttpError(400, 'invalid_nickname', 'Apelido inválido.');
  const nick = raw.trim().replace(/\s+/g, ' ');
  if (nick.length < 2 || nick.length > 20) throw new HttpError(400, 'invalid_nickname', 'O apelido precisa ter de 2 a 20 caracteres.');
  if (/[<>\p{Cc}]/u.test(nick)) throw new HttpError(400, 'invalid_nickname', 'O apelido tem caracteres não permitidos.');
  return nick;
}

/** Aceita só os campos conhecidos de uma ação (o motor valida o resto). */
export function parseAction(raw: unknown): Action {
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'invalid_action', 'Jogada inválida.');
  const a = raw as Record<string, unknown>;
  switch (a.type) {
    case 'play':
      if (!Number.isInteger(a.index)) throw new HttpError(400, 'invalid_action', 'Carta inválida.');
      return { type: 'play', index: a.index as number, faceDown: a.faceDown === true };
    case 'truco':
    case 'accept':
    case 'run':
    case 'raise':
      return { type: a.type };
    case 'mao10':
      if (typeof a.play !== 'boolean') throw new HttpError(400, 'invalid_action', 'Decisão inválida.');
      return { type: 'mao10', play: a.play };
    default:
      throw new HttpError(400, 'invalid_action', 'Jogada desconhecida.');
  }
}

function tableSeats(seats: SeatInfo[]): TableSeats {
  const human = { 0: false, 1: false, 2: false, 3: false } as Record<Seat, boolean>;
  const personality: TableSeats['personality'] = {};
  for (const s of seats) {
    human[s.seat] = !s.isBot;
    if (s.isBot && s.personality) personality[s.seat] = s.personality;
  }
  return { human, personality };
}

/** Separa os eventos públicos das mãos secretas (cada assento só recebe a sua). */
export function toStepPayload(events: TimedEvent[]): StepPayload {
  const dealt: StepPayload['dealt'] = { '0': [], '1': [], '2': [], '3': [] };
  const pub = events.map(({ event, delayMs, dealt: hands }) => {
    if (event.type === 'hand_started') {
      for (const s of [0, 1, 2, 3]) dealt[String(s)]!.push(hands?.[s] ?? []);
    }
    return { event, delayMs };
  });
  return { events: pub, dealt };
}

function toClientStep(version: number, payload: StepPayload, seat: Seat): ClientStep {
  const mine = payload.dealt[String(seat)] ?? [];
  let i = 0;
  return {
    version,
    events: payload.events.map((e) => (e.event.type === 'hand_started' ? { ...e, myHand: mine[i++] ?? [] } : e)),
  };
}

function finishInfo(state: MatchState): FinishInfo | null {
  if (state.phase !== 'match_over' || state.winner === null) return null;
  return { scores: [state.scores[0], state.scores[1]], winnerTeam: state.winner, capote: state.capote };
}

export function createApi(deps: ApiDeps) {
  const { store, auth } = deps;
  const deck = deps.deck ?? (() => secureShuffle(createDeck()));
  const rng = deps.rng ?? Math.random;

  async function requireUser(req: ApiRequest): Promise<AuthUser> {
    const h = req.headers['authorization'] ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    const user = token ? await auth.verify(token) : null;
    if (!user) throw new HttpError(401, 'unauthorized', 'Faça login para jogar online.');
    return user;
  }

  async function loadForUser(id: string, user: AuthUser): Promise<{ rec: MatchRecord; seat: Seat }> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'not_found', 'Partida não encontrada.');
    const rec = await store.getMatch(id);
    const me = rec?.seats.find((s) => s.userId === user.id);
    if (!rec || !me) throw new HttpError(404, 'not_found', 'Partida não encontrada.');
    return { rec, seat: me.seat };
  }

  function payload(rec: MatchRecord, seat: Seat, steps: { version: number; payload: StepPayload }[]): MatchPayload {
    const ts = tableSeats(rec.seats);
    const waitingFor = rec.status === 'active' ? humanToAct(rec.state, ts) : null;
    return {
      matchId: rec.id,
      status: rec.status,
      version: rec.version,
      seat,
      seats: rec.seats.map((s) => ({ seat: s.seat, name: s.name, isBot: s.isBot, personality: s.personality, isYou: s.seat === seat })),
      view: getPlayerView(rec.state, seat),
      legal: waitingFor !== null && rec.status === 'active' ? getLegalActions(rec.state, seat) : [],
      waitingFor,
      steps: steps.map((s) => toClientStep(s.version, s.payload, seat)),
    };
  }

  const routes: { method: string; pattern: RegExp; handler: (req: ApiRequest, m: RegExpMatchArray) => Promise<ApiResponse> }[] = [
    {
      method: 'GET',
      pattern: /^\/api\/health$/,
      handler: async () => json(200, { ok: true }),
    },
    {
      method: 'GET',
      pattern: /^\/api\/me$/,
      handler: async (req) => {
        const user = await requireUser(req);
        const [profile, stats, activeMatchId] = await Promise.all([
          store.getProfile(user.id),
          store.getStats(user.id),
          store.activeMatchOf(user.id),
        ]);
        return json(200, { user: { id: user.id, email: user.email }, profile, stats, activeMatchId });
      },
    },
    {
      method: 'PUT',
      pattern: /^\/api\/me$/,
      handler: async (req) => {
        const user = await requireUser(req);
        const nickname = validateNickname((req.body as { nickname?: unknown } | null)?.nickname);
        const r = await store.setNickname(user.id, nickname);
        if (r === 'taken') throw new HttpError(409, 'nickname_taken', 'Esse apelido já está em uso.');
        return json(200, { profile: { userId: user.id, nickname } });
      },
    },
    {
      method: 'GET',
      pattern: /^\/api\/me\/history$/,
      handler: async (req) => {
        const user = await requireUser(req);
        const limit = Math.min(Math.max(Number(req.query.get('limit')) || 20, 1), 50);
        return json(200, { items: await store.listHistory(user.id, limit) });
      },
    },
    {
      method: 'POST',
      pattern: /^\/api\/matches$/,
      handler: async (req) => {
        const user = await requireUser(req);
        const mode = (req.body as { mode?: unknown } | null)?.mode ?? 'solo';
        if (mode !== 'solo') throw new HttpError(400, 'invalid_mode', 'Por enquanto só existe a partida solo online.');
        const profile = await store.getProfile(user.id);
        if (!profile) throw new HttpError(400, 'needs_nickname', 'Escolha um apelido antes de jogar.');

        const seats: SeatInfo[] = [{ seat: 0, userId: user.id, isBot: false, personality: null, name: profile.nickname }, ...BOTS.map((b) => ({ ...b, userId: null }))];
        const seed = Math.floor(rng() * 2 ** 31);
        const created = createMatch({}, seed, deck());
        const first: TimedEvent[] = created.events.map((e) => ({
          event: e,
          delayMs: 0,
          ...(e.type === 'hand_started' ? { dealt: dealtViews(created.state) } : {}),
        }));
        const run = runBots(created.state, tableSeats(seats), { rng, deck });
        const step = toStepPayload([...first, ...run.events]);
        // Partida solo não termina antes de o humano agir (bots não fecham 12 sozinhos na 1ª mão),
        // mas por segurança, se terminar, grava como passo 1 + finalização imediata.
        const id = await store.createMatch({ ownerId: user.id, mode: 'solo', seats, state: run.state, step });
        const fin = finishInfo(run.state);
        if (fin) await store.applyStep(id, 1, run.state, { events: [], dealt: {} }, fin);
        const rec = (await store.getMatch(id))!;
        return json(201, payload(rec, 0, await store.getSteps(id, 0)));
      },
    },
    {
      method: 'GET',
      pattern: /^\/api\/matches\/([^/]+)$/,
      handler: async (req, m) => {
        const user = await requireUser(req);
        const { rec, seat } = await loadForUser(m[1]!, user);
        const since = req.query.has('since') ? Math.max(0, Number(req.query.get('since')) || 0) : rec.version;
        return json(200, payload(rec, seat, await store.getSteps(rec.id, since)));
      },
    },
    {
      method: 'POST',
      pattern: /^\/api\/matches\/([^/]+)\/action$/,
      handler: async (req, m) => {
        const user = await requireUser(req);
        const body = (req.body ?? {}) as { action?: unknown; version?: unknown };
        const action = parseAction(body.action);
        const { rec, seat } = await loadForUser(m[1]!, user);
        if (rec.status !== 'active') throw new HttpError(409, 'match_over', 'A partida já terminou.');
        if (body.version !== rec.version) {
          return json(409, { error: 'conflict', message: 'A mesa mudou. Atualizando…', version: rec.version });
        }
        const res = applyHumanAction(rec.state, seat, action, tableSeats(rec.seats), { rng, deck });
        if (!res.ok) throw new HttpError(400, 'illegal_action', res.error);
        const step = toStepPayload(res.result.events);
        const version = await store.applyStep(rec.id, rec.version, res.result.state, step, finishInfo(res.result.state));
        if (version === null) {
          const now = await store.getMatch(rec.id);
          return json(409, { error: 'conflict', message: 'A mesa mudou. Atualizando…', version: now?.version ?? rec.version });
        }
        const updated = (await store.getMatch(rec.id))!;
        return json(200, payload(updated, seat, await store.getSteps(rec.id, rec.version)));
      },
    },
  ];

  return async function handle(req: ApiRequest): Promise<ApiResponse> {
    try {
      const candidates = routes.filter((r) => r.pattern.test(req.path));
      if (!candidates.length) return json(404, { error: 'not_found', message: 'Rota não encontrada.' });
      const route = candidates.find((r) => r.method === req.method);
      if (!route) return json(405, { error: 'method_not_allowed', message: 'Método não permitido.' });
      return await route.handler(req, req.path.match(route.pattern)!);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.code, message: err.message });
      console.error('Erro na API', err);
      return json(500, { error: 'internal', message: 'Erro interno. Tente de novo.' });
    }
  };
}

export type ApiHandler = ReturnType<typeof createApi>;
