import { betName, nextBetValue } from './betting.ts';
import { cardStrength, createDeck, nextSeat, otherTeam, teamOf } from './cards.ts';
import { decideHand, resolveRound } from './hand.ts';
import { shuffle } from './rng.ts';
import type {
  Action,
  ApplyResult,
  GameEvent,
  HandEndReason,
  HandMode,
  HandState,
  MatchConfig,
  MatchState,
  Seat,
  Team,
} from './types.ts';

export const DEFAULT_CONFIG: MatchConfig = {
  targetScore: 12,
  betLadder: [2, 4, 6, 10, 12],
  maoDeFerro: 'cega',
  firstDealer: 3,
  maoDe10Value: 2,
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T; // estado é JSON puro
}

/** Cria a partida e já distribui a primeira mão. */
export function createMatch(config: Partial<MatchConfig> = {}, seed = 1): { state: MatchState; events: GameEvent[] } {
  const cfg: MatchConfig = { ...DEFAULT_CONFIG, ...config };
  const state: MatchState = {
    config: cfg,
    rngState: seed >>> 0,
    scores: [0, 0],
    phase: 'playing',
    // placeholder; substituído por dealHand
    hand: emptyHand(((cfg.firstDealer + 3) % 4) as Seat, 0),
    winner: null,
    capote: false,
  };
  const events: GameEvent[] = [];
  dealHand(state, cfg.firstDealer, 1, events);
  return { state, events };
}

/** Distribui a próxima mão (só quando phase === 'hand_over'). */
export function startNextHand(prev: MatchState): ApplyResult {
  if (prev.phase !== 'hand_over') return { ok: false, error: 'A mão atual ainda não terminou.' };
  const state = clone(prev);
  const events: GameEvent[] = [];
  dealHand(state, nextSeat(state.hand.dealer), state.hand.number + 1, events);
  return { ok: true, state, events };
}

function emptyHand(dealer: Seat, number: number): HandState {
  return {
    number,
    dealer,
    mode: 'normal',
    hands: [[], [], [], []],
    rounds: [],
    currentRound: 0,
    turn: nextSeat(dealer),
    value: 2,
    pendingBet: null,
    lastRaiser: null,
    maoDe10Team: null,
    result: null,
  };
}

function handModeFor(state: MatchState): { mode: HandMode; maoDe10Team: Team | null } {
  const mark = state.config.targetScore - 2;
  const a = state.scores[0] === mark;
  const b = state.scores[1] === mark;
  if (a && b) return { mode: 'mao_de_ferro', maoDe10Team: null };
  if (a) return { mode: 'mao_de_10', maoDe10Team: 0 };
  if (b) return { mode: 'mao_de_10', maoDe10Team: 1 };
  return { mode: 'normal', maoDe10Team: null };
}

function dealHand(state: MatchState, dealer: Seat, number: number, events: GameEvent[]): void {
  const shuffled = shuffle(createDeck(), state.rngState);
  state.rngState = shuffled.state;
  const hand = emptyHand(dealer, number);
  hand.value = state.config.betLadder[0]!;
  // Distribui 3 cartas para cada um, começando pelo jogador após o dealer.
  let seat = nextSeat(dealer);
  let i = 0;
  for (let c = 0; c < 3; c++) {
    for (let k = 0; k < 4; k++) {
      hand.hands[seat]!.push(shuffled.items[i++]!);
      seat = nextSeat(seat);
    }
  }
  const { mode, maoDe10Team } = handModeFor(state);
  hand.mode = mode;
  hand.maoDe10Team = maoDe10Team;
  hand.rounds = [{ plays: [], winner: null, winningSeat: null }];
  state.hand = hand;
  state.phase = mode === 'mao_de_10' ? 'mao_de_10_decision' : 'playing';
  events.push({
    type: 'hand_started',
    handNumber: number,
    dealer,
    mode,
    value: hand.value,
    maoDe10Team,
    firstSeat: hand.turn,
  });
}

function endHand(state: MatchState, winnerTeam: Team | null, points: number, reason: HandEndReason, events: GameEvent[]): void {
  const hand = state.hand;
  hand.result = { winnerTeam, points: winnerTeam === null ? 0 : points, reason };
  hand.pendingBet = null;
  if (winnerTeam !== null) state.scores[winnerTeam] += points;
  events.push({ type: 'hand_ended', result: hand.result, scores: [state.scores[0], state.scores[1]] });

  const target = state.config.targetScore;
  const champion = state.scores[0] >= target ? 0 : state.scores[1] >= target ? 1 : null;
  if (champion !== null) {
    state.phase = 'match_over';
    state.winner = champion;
    state.capote = state.scores[otherTeam(champion)] === 0;
    events.push({ type: 'match_ended', winner: champion, scores: [state.scores[0], state.scores[1]], capote: state.capote });
  } else {
    state.phase = 'hand_over';
  }
}

function isBlind(state: MatchState): boolean {
  return state.hand.mode === 'mao_de_ferro' && state.config.maoDeFerro === 'cega';
}

/** Ações válidas para um assento no estado atual. */
export function getLegalActions(state: MatchState, seat: Seat): Action[] {
  const hand = state.hand;
  const team = teamOf(seat);
  switch (state.phase) {
    case 'mao_de_10_decision':
      if (hand.maoDe10Team !== team) return [];
      return [
        { type: 'mao10', play: true },
        { type: 'mao10', play: false },
      ];
    case 'bet_response': {
      const bet = hand.pendingBet!;
      if (bet.byTeam === team) return [];
      const actions: Action[] = [{ type: 'accept' }, { type: 'run' }];
      if (nextBetValue(bet.value, state.config.betLadder) !== null) actions.push({ type: 'raise' });
      return actions;
    }
    case 'playing': {
      if (hand.turn !== seat) return [];
      const actions: Action[] = [];
      const cards = hand.hands[seat]!;
      const canCover = hand.currentRound >= 1 && !isBlind(state);
      for (let i = 0; i < cards.length; i++) {
        actions.push({ type: 'play', index: i });
        if (canCover) actions.push({ type: 'play', index: i, faceDown: true });
      }
      if (canCallTruco(state, seat)) actions.push({ type: 'truco' });
      return actions;
    }
    default:
      return [];
  }
}

/** Se o assento pode pedir truco / aumentar agora (na sua vez). */
export function canCallTruco(state: MatchState, seat: Seat): boolean {
  const hand = state.hand;
  return (
    state.phase === 'playing' &&
    hand.turn === seat &&
    hand.mode === 'normal' &&
    hand.lastRaiser !== teamOf(seat) &&
    nextBetValue(hand.value, state.config.betLadder) !== null
  );
}

/**
 * Aplica a intenção de um jogador. Nunca altera o estado recebido.
 * Retorna novo estado + eventos, ou erro se a ação for inválida.
 */
export function applyAction(prev: MatchState, seat: Seat, action: Action): ApplyResult {
  const state = clone(prev);
  const hand = state.hand;
  const team = teamOf(seat);
  const events: GameEvent[] = [];
  const fail = (error: string): ApplyResult => ({ ok: false, error });

  switch (action.type) {
    case 'mao10': {
      if (state.phase !== 'mao_de_10_decision') return fail('Não é hora de decidir a Mão de 10.');
      if (hand.maoDe10Team !== team) return fail('Só a dupla com 10 pontos decide.');
      events.push({ type: 'mao10_decision', seat, team, play: action.play });
      if (action.play) {
        hand.value = state.config.maoDe10Value;
        state.phase = 'playing';
      } else {
        endHand(state, otherTeam(team), state.config.betLadder[0]!, 'mao10_run', events);
      }
      return { ok: true, state, events };
    }

    case 'truco': {
      if (state.phase !== 'playing') return fail('Não é possível pedir truco agora.');
      if (hand.turn !== seat) return fail('Só pode pedir truco na sua vez.');
      if (hand.mode !== 'normal') {
        // PRD 3.4: pedir truco na Mão de 10 (ou na Mão de Ferro) perde a mão.
        events.push({
          type: 'penalty',
          seat,
          team,
          reason: hand.mode === 'mao_de_10' ? 'truco_na_mao_de_10' : 'truco_na_mao_de_ferro',
        });
        endHand(state, otherTeam(team), hand.value, 'penalty', events);
        return { ok: true, state, events };
      }
      if (hand.lastRaiser === team) return fail('Sua dupla não pode aumentar duas vezes seguidas.');
      const next = nextBetValue(hand.value, state.config.betLadder);
      if (next === null) return fail('A mão já vale o máximo.');
      hand.pendingBet = { value: next, byTeam: team, bySeat: seat, previousValue: hand.value, turnSeat: hand.turn };
      state.phase = 'bet_response';
      events.push({ type: 'bet_called', seat, team, value: next, name: betName(next, state.config.betLadder), isRaise: false });
      return { ok: true, state, events };
    }

    case 'accept':
    case 'run':
    case 'raise': {
      if (state.phase !== 'bet_response' || !hand.pendingBet) return fail('Não há aposta pendente.');
      const bet = hand.pendingBet;
      if (bet.byTeam === team) return fail('Só a dupla desafiada responde.');
      if (action.type === 'accept') {
        hand.value = bet.value;
        hand.lastRaiser = bet.byTeam;
        hand.turn = bet.turnSeat;
        hand.pendingBet = null;
        state.phase = 'playing';
        events.push({ type: 'bet_accepted', seat, team, value: bet.value });
      } else if (action.type === 'run') {
        events.push({ type: 'bet_run', seat, team, pointsTo: bet.byTeam, points: bet.previousValue });
        endHand(state, bet.byTeam, bet.previousValue, 'run', events);
      } else {
        const next = nextBetValue(bet.value, state.config.betLadder);
        if (next === null) return fail('A mão já vale o máximo.');
        hand.pendingBet = { value: next, byTeam: team, bySeat: seat, previousValue: bet.value, turnSeat: bet.turnSeat };
        events.push({ type: 'bet_called', seat, team, value: next, name: betName(next, state.config.betLadder), isRaise: true });
      }
      return { ok: true, state, events };
    }

    case 'play': {
      if (state.phase !== 'playing') return fail('Não é hora de jogar carta.');
      if (hand.turn !== seat) return fail('Não é a sua vez.');
      const cards = hand.hands[seat]!;
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= cards.length) {
        return fail('Carta inválida.');
      }
      const blind = isBlind(state);
      const faceDown = !!action.faceDown && !blind;
      if (faceDown && hand.currentRound < 1) return fail('Carta coberta só a partir da 2ª rodada.');
      const [card] = cards.splice(action.index, 1);
      const round = hand.rounds[hand.currentRound]!;
      round.plays.push({ seat, card: card!, faceDown });
      events.push({
        type: 'card_played',
        seat,
        card: faceDown ? null : card!,
        faceDown,
        round: hand.currentRound,
        strength: cardStrength(card!, faceDown),
      });

      if (round.plays.length < 4) {
        hand.turn = nextSeat(seat);
        return { ok: true, state, events };
      }

      const { winner, winningSeat } = resolveRound(round.plays);
      round.winner = winner;
      round.winningSeat = winningSeat;
      events.push({ type: 'round_ended', round: hand.currentRound, winner, winningSeat });

      const decision = decideHand(hand.rounds.map((r) => r.winner!));
      if (decision === 'none') {
        endHand(state, null, 0, 'all_tied', events);
      } else if (decision !== null) {
        endHand(state, decision, hand.value, 'rounds', events);
      } else {
        hand.currentRound += 1;
        hand.rounds.push({ plays: [], winner: null, winningSeat: null });
        hand.turn = winningSeat;
      }
      return { ok: true, state, events };
    }
  }
}

/**
 * Assentos que podem agir agora, em ordem de prioridade.
 * - playing: quem tem a vez
 * - bet_response: dupla desafiada, começando pelo próximo assento após quem pediu
 * - mao_de_10_decision: a dupla com 10, começando pelo primeiro a jogar
 */
export function seatsToAct(state: MatchState): Seat[] {
  const hand = state.hand;
  const all: Seat[] = [0, 1, 2, 3];
  const orderFrom = (start: Seat): Seat[] => all.map((i) => ((start + i) % 4) as Seat);
  switch (state.phase) {
    case 'playing':
      return [hand.turn];
    case 'bet_response': {
      const bet = hand.pendingBet!;
      return orderFrom(nextSeat(bet.bySeat)).filter((s) => teamOf(s) !== bet.byTeam);
    }
    case 'mao_de_10_decision':
      return orderFrom(hand.turn).filter((s) => teamOf(s) === hand.maoDe10Team);
    default:
      return [];
  }
}
