// Store em memória: mesma semântica das funções SQL (supabase/migrations), para testes e dev local.
import type { MatchState } from '@truco/engine';
import type { FinishInfo, HistoryItem, MatchMode, MatchRecord, Profile, SeatInfo, Stats, StepPayload } from '../types.ts';
import { EMPTY_STATS, type Store } from './store.ts';

interface MemMatch extends MatchRecord {
  scores: [number, number];
  winnerTeam: number | null;
  capote: boolean;
  finishedAt: string | null;
  createdAt: number;
  steps: { version: number; payload: StepPayload }[];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class MemoryStore implements Store {
  private matches = new Map<string, MemMatch>();
  private profiles = new Map<string, Profile>();
  private stats = new Map<string, Stats>();
  private seq = 0;

  async createMatch(input: { ownerId: string; mode: MatchMode; seats: SeatInfo[]; state: MatchState; step: StepPayload }): Promise<string> {
    for (const m of this.matches.values()) {
      if (m.ownerId === input.ownerId && m.status === 'active') m.status = 'abandoned';
    }
    const id = crypto.randomUUID();
    this.matches.set(id, {
      id,
      mode: input.mode,
      status: 'active',
      version: 1,
      ownerId: input.ownerId,
      seats: clone(input.seats),
      state: clone(input.state),
      scores: [0, 0],
      winnerTeam: null,
      capote: false,
      finishedAt: null,
      createdAt: ++this.seq,
      steps: [{ version: 1, payload: clone(input.step) }],
    });
    return id;
  }

  async getMatch(id: string): Promise<MatchRecord | null> {
    const m = this.matches.get(id);
    if (!m) return null;
    return { id: m.id, mode: m.mode, status: m.status, version: m.version, ownerId: m.ownerId, seats: clone(m.seats), state: clone(m.state) };
  }

  async applyStep(id: string, expectedVersion: number, state: MatchState, step: StepPayload, finish: FinishInfo | null): Promise<number | null> {
    const m = this.matches.get(id);
    if (!m || m.status !== 'active' || m.version !== expectedVersion) return null;
    m.version += 1;
    m.state = clone(state);
    m.steps.push({ version: m.version, payload: clone(step) });
    if (finish) this.finish(m, finish);
    return m.version;
  }

  private finish(m: MemMatch, f: FinishInfo) {
    m.status = 'finished';
    m.scores = [...f.scores];
    m.winnerTeam = f.winnerTeam;
    m.capote = f.capote;
    m.finishedAt = new Date(Date.now() + this.seq++).toISOString();
    for (const s of m.seats) {
      if (!s.userId) continue;
      const st = { ...(this.stats.get(s.userId) ?? EMPTY_STATS) };
      const won = s.seat % 2 === f.winnerTeam;
      st.matchesPlayed += 1;
      if (won) {
        st.wins += 1;
        if (f.capote) st.capotes += 1;
        st.winStreak += 1;
        st.bestStreak = Math.max(st.bestStreak, st.winStreak);
      } else {
        st.losses += 1;
        st.winStreak = 0;
      }
      this.stats.set(s.userId, st);
    }
  }

  async getSteps(id: string, since: number) {
    const m = this.matches.get(id);
    return m ? clone(m.steps.filter((s) => s.version > since)) : [];
  }

  async activeMatchOf(userId: string): Promise<string | null> {
    let best: MemMatch | null = null;
    for (const m of this.matches.values()) {
      if (m.status === 'active' && m.seats.some((s) => s.userId === userId) && (!best || m.createdAt > best.createdAt)) best = m;
    }
    return best?.id ?? null;
  }

  async getProfile(userId: string) {
    const p = this.profiles.get(userId);
    return p ? { ...p } : null;
  }

  async setNickname(userId: string, nickname: string): Promise<'ok' | 'taken'> {
    const lower = nickname.toLowerCase();
    for (const p of this.profiles.values()) {
      if (p.userId !== userId && p.nickname.toLowerCase() === lower) return 'taken';
    }
    this.profiles.set(userId, { userId, nickname });
    return 'ok';
  }

  async getStats(userId: string): Promise<Stats> {
    return { ...(this.stats.get(userId) ?? EMPTY_STATS) };
  }

  async listHistory(userId: string, limit: number): Promise<HistoryItem[]> {
    const items: (HistoryItem & { _t: string })[] = [];
    for (const m of this.matches.values()) {
      if (m.status !== 'finished') continue;
      const me = m.seats.find((s) => s.userId === userId);
      if (!me) continue;
      const myTeam = me.seat % 2;
      items.push({
        matchId: m.id,
        mode: m.mode,
        finishedAt: m.finishedAt!,
        won: m.winnerTeam === myTeam,
        scoreUs: m.scores[myTeam]!,
        scoreThem: m.scores[1 - myTeam]!,
        capote: m.capote,
        partner: m.seats.find((s) => s.seat === (me.seat + 2) % 4)?.name ?? null,
        opponents: m.seats.filter((s) => s.seat % 2 !== myTeam).map((s) => s.name),
        _t: m.finishedAt!,
      });
    }
    return items
      .sort((a, b) => b._t.localeCompare(a._t))
      .slice(0, Math.min(Math.max(limit, 1), 50))
      .map(({ _t, ...rest }) => rest);
  }
}
