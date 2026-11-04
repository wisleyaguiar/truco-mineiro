import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createMatch,
  createRng,
  getLegalActions,
  getPlayerView,
  parseCard,
  seatsToAct,
  startNextHand,
  teamOf,
  type MatchState,
  type Seat,
} from '@truco/engine';
import {
  believedBest,
  createKnowledge,
  decideAction,
  decideSignal,
  estimateHandChance,
  forgetPlayed,
  honestSignals,
  learn,
  PERSONALITIES,
  whoIntercepts,
  type Knowledge,
} from '../src/index.ts';

const cards = (...ids: string[]) => ids.map(parseCard);

describe('sinais: regras puras', () => {
  it('sinal honesto é a melhor carta sinalizável; sem nada = cego', () => {
    expect(honestSignals(cards('4-paus', '3-copas', '5-ouros'))).toEqual(['zap', 'tres']);
    expect(honestSignals(cards('7-ouros', 'A-espadas'))).toEqual(['espadilha', 'picafumo']);
    expect(honestSignals(cards('K-copas', '5-ouros', '6-paus'))).toEqual(['cego']);
  });

  it('intercepta quem é adversário e está olhando para o sinalizador', () => {
    expect(whoIntercepts(0, { 1: 0, 2: 0, 3: 2 })).toEqual([1]); // 2 é parceiro, 3 olha outro
    expect(whoIntercepts(0, { 1: null, 3: 0 })).toEqual([3]);
    expect(whoIntercepts(1, { 0: 1, 2: 1 })).toEqual([0, 2]);
    expect(whoIntercepts(1, {})).toEqual([]);
  });

  it('memória: aprende, esquece ao jogar e zera quando acabam as cartas', () => {
    const k: Knowledge = createKnowledge();
    learn(k, 2, 'cego');
    expect(believedBest(k, 2)).toBe(5);
    learn(k, 2, 'zap'); // sinal forte substitui o "cego"
    learn(k, 2, 'tres');
    expect(k[2]).toEqual(['zap', 'tres']);
    expect(believedBest(k, 2)).toBe(14);
    forgetPlayed(k, 2, parseCard('4-paus'), 2);
    expect(believedBest(k, 2)).toBe(10);
    forgetPlayed(k, 2, parseCard('5-ouros'), 0);
    expect(believedBest(k, 2)).toBeNull();
  });
});

describe('sinais: decisão do bot', () => {
  function viewWith(hand: string[], seat: Seat = 0) {
    const { state } = createMatch({}, 3);
    state.hand.hands[seat] = cards(...hand);
    return getPlayerView(state, seat);
  }

  it('Desconfiado nunca sinaliza sendo vigiado; sinaliza quando ninguém olha', () => {
    const v = viewWith(['4-paus', '5-ouros', '6-copas']);
    const p = PERSONALITIES.desconfiado;
    for (let i = 0; i < 50; i++) expect(decideSignal(v, { 1: 0 }, p, Math.random, [])).toBeNull();
    expect(decideSignal(v, { 1: null, 3: 2 }, p, Math.random, [])).toBe('zap');
  });

  it('não repete o mesmo sinal na mão', () => {
    const v = viewWith(['4-paus', '5-ouros', '6-copas']);
    expect(decideSignal(v, {}, PERSONALITIES.equilibrado, Math.random, ['zap'])).toBeNull();
  });

  it('saber que o parceiro tem o Zap aumenta a confiança; saber que o adversário tem diminui', () => {
    const v = viewWith(['3-copas', '2-ouros', '5-paus']);
    const base = estimateHandChance(v);
    const withPartner = estimateHandChance(v, learn(createKnowledge(), 2, 'zap'));
    const withOpp = estimateHandChance(v, learn(createKnowledge(), 1, 'zap'));
    expect(withPartner).toBeGreaterThan(base);
    expect(withOpp).toBeLessThan(base);
  });
});

/** Partida bot vs bot em que só a dupla A troca sinais (honestos, sem interceptação). */
function simulate(seed: number, signalingTeam: 0 | 1 | null) {
  const rng = createRng(seed * 31 + 7);
  let { state } = createMatch({}, seed);
  const know: Record<Seat, Knowledge> = { 0: {}, 1: {}, 2: {}, 3: {} };
  const shareSignals = (st: MatchState) => {
    for (const s of [0, 1, 2, 3] as Seat[]) know[s] = createKnowledge();
    if (signalingTeam === null || st.hand.mode !== 'normal') return;
    for (const s of [0, 1, 2, 3] as Seat[]) {
      if (teamOf(s) !== signalingTeam) continue;
      const partner = ((s + 2) % 4) as Seat;
      for (const sig of honestSignals(st.hand.hands[s]!)) learn(know[partner], s, sig);
    }
  };
  shareSignals(state);
  let guard = 0;
  while (state.phase !== 'match_over') {
    if (guard++ > 5000) throw new Error('não terminou');
    if (state.phase === 'hand_over') {
      state = (startNextHand(state) as { state: MatchState }).state;
      shareSignals(state);
      continue;
    }
    const seat = seatsToAct(state)[0]!;
    const legal = getLegalActions(state, seat);
    const action = decideAction(getPlayerView(state, seat), legal, 'equilibrado', rng, know[seat]);
    const r = applyAction(state, seat, action);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
    for (const e of r.events) {
      if (e.type === 'card_played') {
        for (const s of [0, 1, 2, 3] as Seat[]) forgetPlayed(know[s], e.seat, e.card, state.hand.hands[e.seat]!.length);
      }
    }
  }
  return state.winner!;
}

describe('sinais: vantagem estatística', () => {
  it('dupla que troca sinais vence mais que a que não troca', () => {
    const N = 1000;
    let wins = 0;
    for (let seed = 1; seed <= N; seed++) {
      // alterna qual dupla sinaliza para não depender de quem começa
      const team = (seed % 2) as 0 | 1;
      if (simulate(seed, team) === team) wins++;
    }
    console.log(`dupla com sinais venceu ${wins}/${N} (${((100 * wins) / N).toFixed(1)}%)`);
    // Resultado atual: ~54% (controle sem sinais: ~50%). Truco tem muita sorte; o ganho é real mas moderado.
    expect(wins / N).toBeGreaterThan(0.52);
  });

  it('sem sinais, as duplas ficam equilibradas (controle)', () => {
    const N = 1000;
    let a = 0;
    for (let seed = 1; seed <= N; seed++) if (simulate(seed, null) === 0) a++;
    console.log(`controle sem sinais: dupla A ${a}/${N}`);
    expect(a / N).toBeGreaterThan(0.44);
    expect(a / N).toBeLessThan(0.56);
  });
});
