// Tipos centrais do motor de regras do Truco Mineiro (Manilha Velha).

export type Suit = 'paus' | 'copas' | 'espadas' | 'ouros';
export type Rank = '4' | '5' | '6' | '7' | 'Q' | 'J' | 'K' | 'A' | '2' | '3';

export interface Card {
  /** Identificador estável, ex.: "4-paus". */
  id: string;
  rank: Rank;
  suit: Suit;
}

/** Assentos 0..3. Dupla A = assentos 0 e 2; Dupla B = assentos 1 e 3. */
export type Seat = 0 | 1 | 2 | 3;
/** 0 = Dupla A, 1 = Dupla B. */
export type Team = 0 | 1;

export type HandMode = 'normal' | 'mao_de_10' | 'mao_de_ferro';

export type Phase =
  | 'mao_de_10_decision' // dupla com 10 decide se joga ou corre
  | 'playing' // vez de alguém jogar carta (ou pedir truco)
  | 'bet_response' // dupla desafiada precisa aceitar / correr / aumentar
  | 'hand_over' // mão terminou; aguardando startNextHand()
  | 'match_over';

export type BetName = 'truco' | 'seis' | 'dez' | 'doze';

export interface MatchConfig {
  /** Pontos para vencer a queda. Padrão 12. */
  targetScore: number;
  /** Escada de valores da mão. Padrão [2, 4, 6, 10, 12]. */
  betLadder: number[];
  /** Regra da Mão de Ferro (10 a 10). Padrão 'cega'. */
  maoDeFerro: 'cega' | 'aberta';
  /** Assento do primeiro dealer. Padrão 3 (assento 0 começa). */
  firstDealer: Seat;
  /**
   * Valor da Mão de 10 quando a dupla decide jogar. Padrão 4 (correr dá 2 ao adversário).
   * Obs.: o PRD previa 2, mas com 2 correr nunca compensa (perde 2 de qualquer jeito).
   */
  maoDe10Value: number;
}

export interface Play {
  seat: Seat;
  card: Card;
  faceDown: boolean;
}

export type RoundWinner = Team | 'tie';

export interface RoundState {
  plays: Play[];
  /** null enquanto a vaza está em andamento. */
  winner: RoundWinner | null;
  /** Assento que fez a vaza (ou que puxa a próxima em caso de canga). */
  winningSeat: Seat | null;
}

export interface PendingBet {
  /** Valor proposto (ex.: 4 no "Truco!"). */
  value: number;
  byTeam: Team;
  bySeat: Seat;
  /** Valor da mão antes desta proposta (vai para quem pediu se o outro correr). */
  previousValue: number;
  /** De quem era a vez quando o grito começou (volta a ser após aceitar). */
  turnSeat: Seat;
}

export type HandEndReason = 'rounds' | 'run' | 'all_tied' | 'mao10_run' | 'penalty';

export interface HandResult {
  winnerTeam: Team | null;
  points: number;
  reason: HandEndReason;
}

export interface HandState {
  number: number;
  dealer: Seat;
  mode: HandMode;
  /** Cartas restantes na mão de cada assento. */
  hands: Card[][];
  rounds: RoundState[];
  currentRound: number;
  turn: Seat;
  /** Valor vigente da mão. */
  value: number;
  pendingBet: PendingBet | null;
  /** Última dupla que aumentou a aposta (regra de alternância). */
  lastRaiser: Team | null;
  /** Dupla que está na Mão de 10 (se houver). */
  maoDe10Team: Team | null;
  result: HandResult | null;
}

export interface MatchState {
  config: MatchConfig;
  rngState: number;
  scores: [number, number];
  phase: Phase;
  hand: HandState;
  winner: Team | null;
  capote: boolean;
}

export type Action =
  | { type: 'play'; index: number; faceDown?: boolean }
  | { type: 'truco' }
  | { type: 'accept' }
  | { type: 'run' }
  | { type: 'raise' }
  | { type: 'mao10'; play: boolean };

export type GameEvent =
  | { type: 'hand_started'; handNumber: number; dealer: Seat; mode: HandMode; value: number; maoDe10Team: Team | null; firstSeat: Seat }
  | { type: 'card_played'; seat: Seat; card: Card | null; faceDown: boolean; round: number; strength: number }
  | { type: 'round_ended'; round: number; winner: RoundWinner; winningSeat: Seat | null }
  | { type: 'bet_called'; seat: Seat; team: Team; value: number; name: BetName; isRaise: boolean }
  | { type: 'bet_accepted'; seat: Seat; team: Team; value: number }
  | { type: 'bet_run'; seat: Seat; team: Team; pointsTo: Team; points: number }
  | { type: 'mao10_decision'; seat: Seat; team: Team; play: boolean }
  | { type: 'penalty'; seat: Seat; team: Team; reason: 'truco_na_mao_de_10' | 'truco_na_mao_de_ferro' }
  | { type: 'hand_ended'; result: HandResult; scores: [number, number] }
  | { type: 'match_ended'; winner: Team; scores: [number, number]; capote: boolean };

export type ApplyResult =
  | { ok: true; state: MatchState; events: GameEvent[] }
  | { ok: false; error: string };

/** O que um jogador (humano ou bot) pode enxergar. Nunca contém mãos alheias. */
export interface PlayerView {
  seat: Seat;
  team: Team;
  scores: [number, number];
  phase: Phase;
  handNumber: number;
  dealer: Seat;
  mode: HandMode;
  value: number;
  /** Suas cartas. Na Mão de Ferro cega, cada carta vem como null. */
  myHand: (Card | null)[];
  /** Mão do parceiro: só durante a decisão da Mão de 10, para a dupla que tem 10. */
  partnerHand: Card[] | null;
  handCounts: [number, number, number, number];
  rounds: { plays: { seat: Seat; card: Card | null; faceDown: boolean }[]; winner: RoundWinner | null; winningSeat: Seat | null }[];
  currentRound: number;
  turn: Seat;
  pendingBet: { value: number; byTeam: Team; bySeat: Seat } | null;
  lastRaiser: Team | null;
  maoDe10Team: Team | null;
  result: HandResult | null;
  winner: Team | null;
  config: MatchConfig;
}
