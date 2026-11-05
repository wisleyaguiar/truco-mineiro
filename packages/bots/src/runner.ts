// "Mesa" autoritativa: aplica a jogada de um humano e deixa os bots jogarem até um humano precisar agir.
// Usado pelo servidor online (e reutilizável no cliente). Não guarda estado: recebe e devolve MatchState.
import {
  applyAction,
  getLegalActions,
  getPlayerView,
  seatsToAct,
  startNextHand,
  teamOf,
  type Action,
  type Card,
  type GameEvent,
  type MatchState,
  type Seat,
} from '@truco/engine';
import { decideAction } from './brain.ts';
import type { PersonalityId } from './personalities.ts';
import type { Knowledge } from './signals.ts';

/** Evento + pausa (ms) que o cliente deve esperar antes de animá-lo (o "pensar" do bot). */
export interface TimedEvent {
  event: GameEvent;
  delayMs: number;
  /**
   * SECRETO — só no servidor: em `hand_started`, a mão recebida por cada assento (como cada um a vê;
   * null nas cartas que o jogador não pode ver, ex.: Mão de Ferro cega). O servidor tira isto
   * antes de enviar e entrega a cada jogador só a própria mão.
   */
  dealt?: (Card | null)[][];
}

/** Mão que cada assento vê logo após a distribuição. */
export function dealtViews(state: MatchState): (Card | null)[][] {
  return ([0, 1, 2, 3] as Seat[]).map((s) => getPlayerView(state, s).myHand);
}

export interface TableSeats {
  /** true = assento controlado por humano. */
  human: Record<Seat, boolean>;
  /** Personalidade dos assentos de bot. */
  personality: Partial<Record<Seat, PersonalityId>>;
}

export interface RunOptions {
  rng?: () => number;
  /** Fornece um baralho embaralhado para cada nova mão (servidor: embaralhamento criptográfico). */
  deck?: () => readonly Card[];
  /** Conhecimento por assento (sinais). Opcional. */
  knowledge?: Partial<Record<Seat, Knowledge>>;
  /** Limite de passos de segurança. */
  maxSteps?: number;
}

export interface RunResult {
  state: MatchState;
  events: TimedEvent[];
  /** Assento humano que precisa agir agora (null se a partida acabou). */
  waitingFor: Seat | null;
}

const BOT_PLAY_MS = [700, 1500] as const;
const BOT_DECIDE_MS = [900, 1600] as const;
const NEXT_HAND_MS = 900;

function between([a, b]: readonly [number, number], rng: () => number) {
  return Math.round(a + rng() * (b - a));
}

/**
 * Qual assento humano deve agir agora? Regras:
 * - vez de jogar: o assento da vez, se for humano;
 * - resposta a truco / decisão da Mão de 10: se a dupla tiver um humano, é ele quem decide.
 */
export function humanToAct(state: MatchState, seats: TableSeats): Seat | null {
  const candidates = seatsToAct(state);
  if (!candidates.length) return null;
  if (state.phase === 'playing') return seats.human[candidates[0]!] ? candidates[0]! : null;
  return candidates.find((s) => seats.human[s]) ?? null;
}

/** Bot que deve agir agora (null se é vez de humano ou não há ação). */
export function botToAct(state: MatchState, seats: TableSeats): Seat | null {
  if (humanToAct(state, seats) !== null) return null;
  const candidates = seatsToAct(state);
  return candidates.find((s) => !seats.human[s]) ?? null;
}

/**
 * Avança a partida enquanto for vez de bots (incluindo distribuir novas mãos), até um humano
 * precisar agir ou a partida acabar.
 */
export function runBots(start: MatchState, seats: TableSeats, opts: RunOptions = {}): RunResult {
  const rng = opts.rng ?? Math.random;
  const events: TimedEvent[] = [];
  let state = start;
  let guard = 0;
  const max = opts.maxSteps ?? 2000;
  while (guard++ < max) {
    if (state.phase === 'match_over') return { state, events, waitingFor: null };
    if (state.phase === 'hand_over') {
      const r = startNextHand(state, opts.deck?.());
      if (!r.ok) throw new Error(r.error);
      state = r.state;
      r.events.forEach((e, i) =>
        events.push({
          event: e,
          delayMs: i === 0 ? NEXT_HAND_MS : 0,
          ...(e.type === 'hand_started' ? { dealt: dealtViews(r.state) } : {}),
        }),
      );
      continue;
    }
    const human = humanToAct(state, seats);
    if (human !== null) return { state, events, waitingFor: human };
    const bot = botToAct(state, seats);
    if (bot === null) throw new Error(`Ninguém pode agir (fase ${state.phase})`);
    const legal = getLegalActions(state, bot);
    const action = decideAction(getPlayerView(state, bot), legal, seats.personality[bot] ?? 'equilibrado', rng, opts.knowledge?.[bot]);
    const r = applyAction(state, bot, action);
    if (!r.ok) throw new Error(`Bot ${bot} fez jogada inválida: ${r.error}`);
    state = r.state;
    const think = state.phase === 'bet_response' || action.type !== 'play' ? BOT_DECIDE_MS : BOT_PLAY_MS;
    r.events.forEach((e, i) => events.push({ event: e, delayMs: i === 0 ? between(think, rng) : 0 }));
  }
  throw new Error('runBots: limite de passos atingido');
}

/**
 * Aplica a jogada de um humano e roda os bots em seguida.
 * Rejeita se não for a vez desse humano agir (inclusive responder por um bot parceiro).
 */
export function applyHumanAction(
  state: MatchState,
  seat: Seat,
  action: Action,
  seats: TableSeats,
  opts: RunOptions = {},
): { ok: true; result: RunResult } | { ok: false; error: string } {
  if (!seats.human[seat]) return { ok: false, error: 'Assento não é humano.' };
  const expected = humanToAct(state, seats);
  if (expected === null || (expected !== seat && teamOf(expected) !== teamOf(seat))) {
    return { ok: false, error: 'Não é a sua vez.' };
  }
  // Na resposta de truco / Mão de 10, qualquer humano da dupla pode decidir.
  const r = applyAction(state, seat, action);
  if (!r.ok) return { ok: false, error: r.error };
  const own: TimedEvent[] = r.events.map((e) => ({ event: e, delayMs: 0 }));
  const rest = runBots(r.state, seats, opts);
  return { ok: true, result: { ...rest, events: [...own, ...rest.events] } };
}
