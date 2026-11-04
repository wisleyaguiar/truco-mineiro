import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createMatch,
  createRng,
  getLegalActions,
  getPlayerView,
  seatsToAct,
  startNextHand,
  type MatchState,
} from '@truco/engine';
import { decideAction, PERSONALITIES, type PersonalityId } from '../src/index.ts';

const IDS = Object.keys(PERSONALITIES) as PersonalityId[];

/** Joga uma partida inteira só com bots. Lança erro se algum bot fizer jogada inválida. */
function simulate(seed: number, personalities: PersonalityId[]) {
  const rng = createRng(seed * 7919 + 1);
  let { state } = createMatch({}, seed);
  let hands = 1;
  let actions = 0;
  const reasons: Record<string, number> = {};
  while (state.phase !== 'match_over') {
    if (actions++ > 5000) throw new Error(`Partida ${seed} não terminou`);
    if (state.phase === 'hand_over') {
      reasons[state.hand.result!.reason] = (reasons[state.hand.result!.reason] ?? 0) + 1;
      const r = startNextHand(state);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
      hands++;
      continue;
    }
    const seat = seatsToAct(state)[0]!;
    const legal = getLegalActions(state, seat);
    expect(legal.length).toBeGreaterThan(0);
    const action = decideAction(getPlayerView(state, seat), legal, personalities[seat]!, rng);
    const r = applyAction(state, seat, action);
    if (!r.ok) throw new Error(`Seed ${seed}: bot ${seat} fez ação inválida ${JSON.stringify(action)}: ${r.error}`);
    state = r.state;
    invariants(state);
  }
  reasons[state.hand.result!.reason] = (reasons[state.hand.result!.reason] ?? 0) + 1;
  return { state, hands, reasons };
}

function invariants(state: MatchState) {
  const h = state.hand;
  const inHand = h.hands.reduce((n, c) => n + c.length, 0);
  const played = h.rounds.reduce((n, r) => n + r.plays.length, 0);
  expect(inHand + played).toBe(12);
  expect(state.config.betLadder).toContain(h.value);
  expect(state.scores[0] % 2).toBe(0);
  expect(state.scores[1] % 2).toBe(0);
}

describe('simulação bot vs bot', () => {
  it('1.000 partidas terminam sem erro e com placar coerente', () => {
    const wins = [0, 0];
    const reasons: Record<string, number> = {};
    let totalHands = 0;
    let capotes = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const ps = [0, 1, 2, 3].map((i) => IDS[(seed + i) % IDS.length]!);
      const { state, hands, reasons: r } = simulate(seed, ps);
      expect(state.winner).not.toBeNull();
      const w = state.winner!;
      expect(state.scores[w]).toBeGreaterThanOrEqual(12);
      expect(state.scores[1 - w]).toBeLessThan(12);
      expect(state.capote).toBe(state.scores[1 - w] === 0);
      wins[w]++;
      totalHands += hands;
      if (state.capote) capotes++;
      for (const [k, v] of Object.entries(r)) reasons[k] = (reasons[k] ?? 0) + v;
    }
    console.log('vitórias por dupla', wins, '| mãos/partida', (totalHands / 1000).toFixed(1), '| capotes', capotes, '| fim de mão', reasons);
    expect(wins[0] + wins[1]).toBe(1000);
  });

  it('bot equilibrado vence bots que só jogam a primeira carta na maioria das vezes', () => {
    let smartWins = 0;
    const N = 300;
    for (let seed = 1; seed <= N; seed++) {
      const rng = createRng(seed);
      let { state } = createMatch({}, seed);
      while (state.phase !== 'match_over') {
        if (state.phase === 'hand_over') {
          state = (startNextHand(state) as { state: MatchState }).state;
          continue;
        }
        const seat = seatsToAct(state)[0]!;
        const legal = getLegalActions(state, seat);
        const action =
          seat % 2 === 0
            ? decideAction(getPlayerView(state, seat), legal, 'equilibrado', rng)
            : (legal.find((a) => a.type === 'accept' || a.type === 'play' || a.type === 'mao10') ?? legal[0]!);
        const r = applyAction(state, seat, action);
        if (!r.ok) throw new Error(r.error);
        state = r.state;
      }
      if (state.winner === 0) smartWins++;
    }
    console.log(`equilibrado vs ingênuo: ${smartWins}/${N}`);
    expect(smartWins / N).toBeGreaterThan(0.6);
  });
});
