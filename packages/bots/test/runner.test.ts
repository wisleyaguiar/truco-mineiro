import { describe, expect, it } from 'vitest';
import { createDeck, createMatch, createRng, getLegalActions, secureShuffle, type Seat } from '@truco/engine';
import { applyHumanAction, humanToAct, runBots, type TableSeats } from '../src/index.ts';

const SOLO: TableSeats = {
  human: { 0: true, 1: false, 2: false, 3: false },
  personality: { 1: 'blefe', 2: 'equilibrado', 3: 'desconfiado' },
};

describe('runner (mesa autoritativa)', () => {
  it('para quando um humano precisa agir e nunca joga por ele', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { state } = createMatch({}, seed);
      const r = runBots(state, SOLO, { rng: createRng(seed) });
      if (r.waitingFor !== null) {
        expect(r.waitingFor).toBe(0);
        expect(humanToAct(r.state, SOLO)).toBe(0);
      }
      for (const t of r.events) {
        if (t.event.type === 'card_played') expect(t.event.seat).not.toBe(0);
      }
    }
  });

  it('partida solo inteira só com jogadas do humano (com baralho seguro)', () => {
    const rng = createRng(7);
    let { state } = createMatch({}, 7, secureShuffle(createDeck()));
    let r = runBots(state, SOLO, { rng, deck: () => secureShuffle(createDeck()) });
    let humanMoves = 0;
    while (r.waitingFor !== null) {
      const legal = getLegalActions(r.state, 0);
      // humano simples: aceita truco, joga na Mão de 10, joga a primeira carta
      const action = legal.find((a) => a.type === 'accept' || a.type === 'mao10' || a.type === 'play') ?? legal[0]!;
      const res = applyHumanAction(r.state, 0, action, SOLO, { rng, deck: () => secureShuffle(createDeck()) });
      if (!res.ok) throw new Error(res.error);
      r = res.result;
      humanMoves++;
      expect(humanMoves).toBeLessThan(500);
    }
    expect(r.state.phase).toBe('match_over');
    expect(Math.max(...r.state.scores)).toBeGreaterThanOrEqual(12);
  });

  it('rejeita jogada fora da vez do humano', () => {
    const { state } = createMatch({}, 3);
    const r = runBots(state, SOLO, { rng: createRng(3) });
    // força um estado em que é vez de um bot jogar
    const st = { ...r.state, phase: 'playing' as const, hand: { ...r.state.hand, turn: 1 as Seat } };
    expect(applyHumanAction(st, 0, { type: 'play', index: 0 }, SOLO).ok).toBe(false);
  });

  it('eventos de bot têm pausa (pensando); os do humano não', () => {
    const { state } = createMatch({}, 11);
    const r = runBots(state, SOLO, { rng: createRng(11) });
    const legal = getLegalActions(r.state, 0);
    const res = applyHumanAction(r.state, 0, legal.find((a) => a.type === 'play')!, SOLO, { rng: createRng(1) });
    if (!res.ok) throw new Error(res.error);
    expect(res.result.events[0]!.delayMs).toBe(0);
    const botPlays = res.result.events.filter((e) => e.event.type === 'card_played' && e.event.seat !== 0);
    for (const b of botPlays) expect(b.delayMs).toBeGreaterThan(0);
  });
});
