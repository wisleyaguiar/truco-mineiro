import type { MatchState } from '@truco/engine';
import type { FinishInfo, HistoryItem, MatchMode, MatchRecord, Profile, SeatInfo, Stats, StepPayload } from '../types.ts';

/**
 * Persistência. Duas implementações: memória (testes/desenvolvimento local) e Supabase (produção).
 * As regras de negócio ficam na API; o store só grava/lê de forma atômica.
 */
export interface Store {
  /** Cria a partida (abandonando a ativa anterior do mesmo dono) com o passo 1. */
  createMatch(input: { ownerId: string; mode: MatchMode; seats: SeatInfo[]; state: MatchState; step: StepPayload }): Promise<string>;
  getMatch(id: string): Promise<MatchRecord | null>;
  /** Grava um passo se `expectedVersion` for a atual. Retorna a nova versão, ou null em conflito. */
  applyStep(id: string, expectedVersion: number, state: MatchState, step: StepPayload, finish: FinishInfo | null): Promise<number | null>;
  /** Passos com versão > since, em ordem. */
  getSteps(id: string, since: number): Promise<{ version: number; payload: StepPayload }[]>;
  /** Partida ativa mais recente do usuário (para retomar). */
  activeMatchOf(userId: string): Promise<string | null>;

  getProfile(userId: string): Promise<Profile | null>;
  /** Cria/atualiza o apelido. `taken` se outro usuário já usa (sem diferenciar maiúsculas). */
  setNickname(userId: string, nickname: string): Promise<'ok' | 'taken'>;
  getStats(userId: string): Promise<Stats>;
  listHistory(userId: string, limit: number): Promise<HistoryItem[]>;
}

export const EMPTY_STATS: Stats = { matchesPlayed: 0, wins: 0, losses: 0, capotes: 0, winStreak: 0, bestStreak: 0 };
