// Store de produção: Supabase com a chave secreta (só no servidor; ignora RLS).
// As operações que precisam ser atômicas usam as funções SQL de supabase/migrations.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MatchState } from '@truco/engine';
import type { FinishInfo, HistoryItem, MatchMode, MatchRecord, Profile, SeatInfo, Stats, StepPayload } from '../types.ts';
import { EMPTY_STATS, type Store } from './store.ts';

function fail(where: string, error: { message: string; code?: string } | null): never {
  throw new Error(`Supabase (${where}): ${error?.message ?? 'erro desconhecido'}`);
}

interface ParticipantRow {
  seat: number;
  user_id: string | null;
  is_bot: boolean;
  bot_personality: string | null;
  display_name: string;
}

export class SupabaseStore implements Store {
  private db: SupabaseClient;

  constructor(url: string, secretKey: string) {
    this.db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async createMatch(input: { ownerId: string; mode: MatchMode; seats: SeatInfo[]; state: MatchState; step: StepPayload }): Promise<string> {
    const { data, error } = await this.db.rpc('create_match', {
      p_owner: input.ownerId,
      p_mode: input.mode,
      p_participants: input.seats.map((s) => ({ ...s, userId: s.userId ?? '' })),
      p_state: input.state,
      p_step: input.step,
    });
    if (error || typeof data !== 'string') fail('create_match', error);
    return data;
  }

  async getMatch(id: string): Promise<MatchRecord | null> {
    const { data, error } = await this.db
      .from('matches')
      .select('id, mode, status, version, owner_id, match_participants(seat, user_id, is_bot, bot_personality, display_name), match_states(state)')
      .eq('id', id)
      .maybeSingle();
    if (error) fail('getMatch', error);
    if (!data) return null;
    const row = data as unknown as {
      id: string;
      mode: MatchMode;
      status: MatchRecord['status'];
      version: number;
      owner_id: string;
      match_participants: ParticipantRow[];
      match_states: { state: MatchState } | { state: MatchState }[] | null;
    };
    const st = Array.isArray(row.match_states) ? row.match_states[0] : row.match_states;
    if (!st) return null;
    return {
      id: row.id,
      mode: row.mode,
      status: row.status,
      version: row.version,
      ownerId: row.owner_id,
      state: st.state,
      seats: row.match_participants
        .map((p) => ({
          seat: p.seat as SeatInfo['seat'],
          userId: p.user_id,
          isBot: p.is_bot,
          personality: (p.bot_personality as SeatInfo['personality']) ?? null,
          name: p.display_name,
        }))
        .sort((a, b) => a.seat - b.seat),
    };
  }

  async applyStep(id: string, expectedVersion: number, state: MatchState, step: StepPayload, finish: FinishInfo | null) {
    const { data, error } = await this.db.rpc('apply_step', {
      p_match: id,
      p_expected: expectedVersion,
      p_state: state,
      p_step: step,
      p_finish: finish,
    });
    if (error) fail('apply_step', error);
    return typeof data === 'number' ? data : null;
  }

  async getSteps(id: string, since: number) {
    const { data, error } = await this.db
      .from('match_events')
      .select('version, payload')
      .eq('match_id', id)
      .gt('version', since)
      .order('version', { ascending: true });
    if (error) fail('getSteps', error);
    return (data ?? []) as { version: number; payload: StepPayload }[];
  }

  async activeMatchOf(userId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from('match_participants')
      .select('match_id, matches!inner(status, created_at)')
      .eq('user_id', userId)
      .eq('matches.status', 'active');
    if (error) fail('activeMatchOf', error);
    const rows = (data ?? []) as unknown as { match_id: string; matches: { created_at: string } | { created_at: string }[] }[];
    const at = (r: (typeof rows)[number]) => (Array.isArray(r.matches) ? r.matches[0]?.created_at : r.matches.created_at) ?? '';
    rows.sort((a, b) => at(b).localeCompare(at(a)));
    return rows[0]?.match_id ?? null;
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.db.from('profiles').select('user_id, nickname').eq('user_id', userId).maybeSingle();
    if (error) fail('getProfile', error);
    return data ? { userId: data.user_id as string, nickname: data.nickname as string } : null;
  }

  async setNickname(userId: string, nickname: string): Promise<'ok' | 'taken'> {
    const { error } = await this.db.from('profiles').upsert({ user_id: userId, nickname }, { onConflict: 'user_id' });
    if (error?.code === '23505') return 'taken';
    if (error) fail('setNickname', error);
    return 'ok';
  }

  async getStats(userId: string): Promise<Stats> {
    const { data, error } = await this.db
      .from('user_stats')
      .select('matches_played, wins, losses, capotes, win_streak, best_streak')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) fail('getStats', error);
    if (!data) return { ...EMPTY_STATS };
    return {
      matchesPlayed: data.matches_played,
      wins: data.wins,
      losses: data.losses,
      capotes: data.capotes,
      winStreak: data.win_streak,
      bestStreak: data.best_streak,
    };
  }

  async listHistory(userId: string, limit: number): Promise<HistoryItem[]> {
    const { data, error } = await this.db.rpc('match_history', { p_user: userId, p_limit: limit });
    if (error) fail('match_history', error);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      matchId: r.match_id as string,
      mode: r.mode as string,
      finishedAt: r.finished_at as string,
      won: r.won as boolean,
      scoreUs: r.score_us as number,
      scoreThem: r.score_them as number,
      capote: r.capote as boolean,
      partner: (r.partner as string | null) ?? null,
      opponents: (r.opponents as string[]) ?? [],
    }));
  }
}
