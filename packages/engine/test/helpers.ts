import { createMatch, parseCard, startNextHand, type MatchConfig, type MatchState } from '../src/index.ts';

/**
 * Cria uma partida com mãos definidas. `hands[seat]` = ids das cartas.
 * Se `scores` for passado, a mão é redistribuída com esse placar (para Mão de 10 / Ferro).
 */
export function setup(
  hands: string[][],
  opts: { scores?: [number, number]; config?: Partial<MatchConfig>; seed?: number } = {},
): MatchState {
  let { state } = createMatch(opts.config ?? {}, opts.seed ?? 42);
  if (opts.scores) {
    state = { ...state, scores: [...opts.scores] as [number, number], phase: 'hand_over' };
    const r = startNextHand(state);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  state.hand.hands = hands.map((h) => h.map(parseCard));
  return state;
}

export function must<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error);
  return r as Extract<T, { ok: true }>;
}
