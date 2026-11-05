import type { Card, GameEvent, MatchState, PlayerView, Seat, Team, Action } from '@truco/engine';
import type { PersonalityId } from '@truco/bots';

export interface SeatInfo {
  seat: Seat;
  userId: string | null;
  isBot: boolean;
  personality: PersonalityId | null;
  name: string;
}

export type MatchMode = 'solo';
export type MatchStatus = 'active' | 'finished' | 'abandoned';

export interface MatchRecord {
  id: string;
  mode: MatchMode;
  status: MatchStatus;
  version: number;
  ownerId: string;
  seats: SeatInfo[];
  state: MatchState;
}

/** Evento público (o que qualquer jogador da mesa pode ver) + pausa para animação. */
export interface PublicEvent {
  event: GameEvent;
  delayMs: number;
}

/** O que é gravado por passo: eventos públicos + mãos distribuídas, separadas por assento. */
export interface StepPayload {
  events: PublicEvent[];
  /** Por assento ("0".."3"): a mão de cada `hand_started` deste passo, na ordem. Nunca vai para outro jogador. */
  dealt: Record<string, (Card | null)[][]>;
}

export interface FinishInfo {
  scores: [number, number];
  winnerTeam: Team;
  capote: boolean;
}

export interface Profile {
  userId: string;
  nickname: string;
}

export interface Stats {
  matchesPlayed: number;
  wins: number;
  losses: number;
  capotes: number;
  winStreak: number;
  bestStreak: number;
}

export interface HistoryItem {
  matchId: string;
  mode: string;
  finishedAt: string;
  won: boolean;
  scoreUs: number;
  scoreThem: number;
  capote: boolean;
  partner: string | null;
  opponents: string[];
}

// ---------- Respostas da API (o que o cliente recebe) ----------

/** Um passo como o jogador o vê: eventos + a própria mão em cada distribuição. */
export interface ClientStep {
  version: number;
  events: (PublicEvent & { myHand?: (Card | null)[] })[];
}

export interface PublicSeat {
  seat: Seat;
  name: string;
  isBot: boolean;
  personality: PersonalityId | null;
  isYou: boolean;
}

export interface MatchPayload {
  matchId: string;
  status: MatchStatus;
  version: number;
  seat: Seat;
  seats: PublicSeat[];
  view: PlayerView;
  legal: Action[];
  /** Assento humano que precisa agir (null = partida acabou). */
  waitingFor: Seat | null;
  steps: ClientStep[];
}
