import { describe, expect, it } from 'vitest';
import {
  applyAction,
  cardStrength,
  createDeck,
  createMatch,
  decideHand,
  getLegalActions,
  getPlayerView,
  parseCard,
  resolveRound,
  startNextHand,
  type Action,
  type MatchState,
  type Seat,
} from '../src/index.ts';
import { must, setup } from './helpers.ts';

const s = (id: string) => cardStrength(parseCard(id));

/** Joga a carta pelo id para o assento da vez. */
function play(state: MatchState, id: string, faceDown = false): MatchState {
  const seat = state.hand.turn;
  const index = state.hand.hands[seat]!.findIndex((c) => c.id === id);
  if (index < 0) throw new Error(`Assento ${seat} não tem ${id}`);
  return must(applyAction(state, seat, { type: 'play', index, faceDown })).state;
}

function act(state: MatchState, seat: Seat, action: Action): MatchState {
  return must(applyAction(state, seat, action)).state;
}

describe('baralho e hierarquia', () => {
  it('tem 40 cartas sem 8, 9, 10', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(40);
    expect(new Set(deck.map((c) => c.id)).size).toBe(40);
  });

  it('manilhas fixas em ordem: Zap > Copeta > Espadilha > Pica-fumo > 3', () => {
    expect(s('4-paus')).toBeGreaterThan(s('7-copas'));
    expect(s('7-copas')).toBeGreaterThan(s('A-espadas'));
    expect(s('A-espadas')).toBeGreaterThan(s('7-ouros'));
    expect(s('7-ouros')).toBeGreaterThan(s('3-ouros'));
  });

  it('comuns: 3 > 2 > A > K > J > Q > 7 > 6 > 5 > 4, naipes iguais', () => {
    const order = ['3-copas', '2-copas', 'A-copas', 'K-copas', 'J-copas', 'Q-copas', '7-paus', '6-copas', '5-copas', '4-copas'];
    for (let i = 0; i < order.length - 1; i++) expect(s(order[i]!)).toBeGreaterThan(s(order[i + 1]!));
    expect(s('3-paus')).toBe(s('3-ouros'));
    expect(s('A-ouros')).toBe(s('A-paus'));
    expect(s('7-paus')).toBe(s('7-espadas'));
    expect(s('4-ouros')).toBe(s('4-espadas'));
  });

  it('carta coberta vale 0', () => {
    expect(cardStrength(parseCard('4-paus'), true)).toBe(0);
  });
});

describe('resolveRound', () => {
  it('maior carta vence', () => {
    const r = resolveRound([
      { seat: 0, card: parseCard('3-copas'), faceDown: false },
      { seat: 1, card: parseCard('4-paus'), faceDown: false },
      { seat: 2, card: parseCard('2-copas'), faceDown: false },
      { seat: 3, card: parseCard('5-copas'), faceDown: false },
    ]);
    expect(r).toEqual({ winner: 1, winningSeat: 1 });
  });

  it('maiores iguais em duplas diferentes = canga', () => {
    const r = resolveRound([
      { seat: 0, card: parseCard('3-copas'), faceDown: false },
      { seat: 1, card: parseCard('3-paus'), faceDown: false },
      { seat: 2, card: parseCard('2-copas'), faceDown: false },
      { seat: 3, card: parseCard('5-copas'), faceDown: false },
    ]);
    expect(r.winner).toBe('tie');
    expect(r.winningSeat).toBe(0);
  });

  it('maiores iguais na mesma dupla = vitória da dupla', () => {
    const r = resolveRound([
      { seat: 0, card: parseCard('3-copas'), faceDown: false },
      { seat: 1, card: parseCard('2-paus'), faceDown: false },
      { seat: 2, card: parseCard('3-ouros'), faceDown: false },
      { seat: 3, card: parseCard('5-copas'), faceDown: false },
    ]);
    expect(r.winner).toBe(0);
  });
});

describe('decideHand (regras de canga)', () => {
  it('1ª e 2ª da mesma dupla decide', () => expect(decideHand([0, 0])).toBe(0));
  it('1 a 1 aguarda a 3ª', () => expect(decideHand([0, 1])).toBeNull());
  it('1 a 1 e 3ª decide', () => expect(decideHand([0, 1, 1])).toBe(1));
  it('empate na 1ª: quem vencer a 2ª leva', () => expect(decideHand(['tie', 1])).toBe(1));
  it('empate na 2ª: vence quem ganhou a 1ª', () => expect(decideHand([1, 'tie'])).toBe(1));
  it('empate na 3ª: vence quem ganhou a 1ª', () => expect(decideHand([0, 1, 'tie'])).toBe(0));
  it('empate na 1ª e 2ª: 3ª decide', () => expect(decideHand(['tie', 'tie', 0])).toBe(0));
  it('empate nas 3: ninguém pontua', () => expect(decideHand(['tie', 'tie', 'tie'])).toBe('none'));
  it('só uma vaza não decide', () => expect(decideHand([0])).toBeNull());
});

// Dealer padrão = 3, então o assento 0 começa.
const BASIC = [
  ['3-copas', '2-copas', '5-copas'], // 0
  ['4-copas', '5-paus', '6-paus'], // 1
  ['K-copas', 'J-copas', 'Q-copas'], // 2
  ['4-espadas', '5-espadas', '6-espadas'], // 3
];

describe('fluxo da mão', () => {
  it('assento após o dealer começa e a vez gira', () => {
    const st = setup(BASIC);
    expect(st.hand.turn).toBe(0);
    const st2 = play(st, '3-copas');
    expect(st2.hand.turn).toBe(1);
  });

  it('quem faz a vaza puxa a próxima', () => {
    let st = setup(BASIC);
    st = play(st, '5-copas'); // 0
    st = play(st, '6-paus'); // 1
    st = play(st, 'Q-copas'); // 2 — dama é a maior desta vaza
    st = play(st, '4-espadas'); // 3
    expect(st.hand.rounds[0]!.winner).toBe(0);
    expect(st.hand.turn).toBe(2);
  });

  it('dupla que faz 2 vazas leva o valor da mão', () => {
    let st = setup(BASIC);
    st = play(st, '3-copas');
    st = play(st, '4-copas');
    st = play(st, 'K-copas');
    st = play(st, '4-espadas');
    // dupla A venceu a 1ª, assento 0 puxa
    st = play(st, '2-copas');
    st = play(st, '5-paus');
    st = play(st, 'J-copas');
    const r = must(applyAction(st, 3, { type: 'play', index: 0 }));
    expect(r.state.phase).toBe('hand_over');
    expect(r.state.scores).toEqual([2, 0]);
    expect(r.events.some((e) => e.type === 'hand_ended')).toBe(true);
  });

  it('rejeita jogada fora da vez', () => {
    const st = setup(BASIC);
    expect(applyAction(st, 1, { type: 'play', index: 0 }).ok).toBe(false);
  });

  it('não altera o estado original (imutável)', () => {
    const st = setup(BASIC);
    const before = JSON.stringify(st);
    play(st, '3-copas');
    expect(JSON.stringify(st)).toBe(before);
  });

  it('próxima mão gira o dealer', () => {
    let st = setup(BASIC);
    st = act(st, 0, { type: 'truco' });
    st = act(st, 1, { type: 'run' });
    const r = must(startNextHand(st));
    expect(r.state.hand.dealer).toBe(0);
    expect(r.state.hand.turn).toBe(1);
    expect(r.state.hand.hands.every((h) => h.length === 3)).toBe(true);
  });
});

describe('carta coberta', () => {
  it('proibida na 1ª rodada', () => {
    const st = setup(BASIC);
    expect(applyAction(st, 0, { type: 'play', index: 0, faceDown: true }).ok).toBe(false);
    expect(getLegalActions(st, 0).some((a) => a.type === 'play' && a.faceDown)).toBe(false);
  });

  it('permitida a partir da 2ª e perde para qualquer carta aberta', () => {
    let st = setup(BASIC);
    st = play(st, '3-copas');
    st = play(st, '4-copas');
    st = play(st, 'K-copas');
    st = play(st, '4-espadas');
    expect(getLegalActions(st, 0).some((a) => a.type === 'play' && a.faceDown)).toBe(true);
    st = play(st, '2-copas', true); // coberta
    st = play(st, '5-paus');
    st = play(st, 'Q-copas', true);
    st = play(st, '5-espadas');
    expect(st.hand.rounds[1]!.winner).toBe(1);
  });

  it('a visão pública esconde a carta coberta', () => {
    let st = setup(BASIC);
    st = play(st, '3-copas');
    st = play(st, '4-copas');
    st = play(st, 'K-copas');
    st = play(st, '4-espadas');
    st = play(st, '2-copas', true);
    const v = getPlayerView(st, 1);
    expect(v.rounds[1]!.plays[0]).toEqual({ seat: 0, card: null, faceDown: true });
  });
});

describe('gritos (truco → seis → dez → doze)', () => {
  it('escada 2 → 4 → 6 → 10 → 12 com alternância', () => {
    let st = setup(BASIC);
    st = act(st, 0, { type: 'truco' });
    expect(st.phase).toBe('bet_response');
    expect(st.hand.pendingBet!.value).toBe(4);
    st = act(st, 1, { type: 'raise' });
    expect(st.hand.pendingBet!.value).toBe(6);
    st = act(st, 2, { type: 'raise' });
    expect(st.hand.pendingBet!.value).toBe(10);
    st = act(st, 3, { type: 'raise' });
    expect(st.hand.pendingBet!.value).toBe(12);
    expect(getLegalActions(st, 0).some((a) => a.type === 'raise')).toBe(false);
    st = act(st, 0, { type: 'accept' });
    expect(st.hand.value).toBe(12);
    expect(st.phase).toBe('playing');
    expect(st.hand.turn).toBe(0); // volta para quem tinha a vez
  });

  it('a dupla que pediu não pode responder o próprio pedido', () => {
    let st = setup(BASIC);
    st = act(st, 0, { type: 'truco' });
    expect(applyAction(st, 2, { type: 'accept' }).ok).toBe(false);
  });

  it('mesma dupla não pode aumentar duas vezes seguidas', () => {
    let st = setup(BASIC);
    st = act(st, 0, { type: 'truco' });
    st = act(st, 1, { type: 'accept' });
    expect(applyAction(st, 0, { type: 'truco' }).ok).toBe(false);
    st = play(st, '3-copas');
    // assento 1 (dupla B) pode pedir seis
    expect(getLegalActions(st, 1).some((a) => a.type === 'truco')).toBe(true);
    st = act(st, 1, { type: 'truco' });
    expect(st.hand.pendingBet!.value).toBe(6);
  });

  it('correr dá à outra dupla o valor de antes do aumento', () => {
    let st = setup(BASIC);
    st = act(st, 0, { type: 'truco' });
    const r = must(applyAction(st, 1, { type: 'run' }));
    expect(r.state.scores).toEqual([2, 0]);
  });

  it('correr depois de um aumento dá o valor que já tinha sido aceito', () => {
    let st = setup(BASIC);
    st = act(st, 0, { type: 'truco' }); // 4
    st = act(st, 1, { type: 'raise' }); // seis (6)
    const r = must(applyAction(st, 0, { type: 'run' }));
    expect(r.state.scores).toEqual([0, 4]);
  });

  it('mão aceita vale o novo valor', () => {
    let st = setup(BASIC);
    st = act(st, 0, { type: 'truco' });
    st = act(st, 1, { type: 'accept' });
    st = play(st, '3-copas');
    st = play(st, '4-copas');
    st = play(st, 'K-copas');
    st = play(st, '4-espadas');
    st = play(st, '2-copas');
    st = play(st, '5-paus');
    st = play(st, 'J-copas');
    st = play(st, '5-espadas');
    expect(st.scores).toEqual([4, 0]);
  });

  it('só pede truco na sua vez', () => {
    const st = setup(BASIC);
    expect(applyAction(st, 1, { type: 'truco' }).ok).toBe(false);
  });
});

describe('Mão de 10', () => {
  const opts = { scores: [10, 4] as [number, number] };

  it('começa em decisão e mostra a mão do parceiro só para a dupla com 10', () => {
    const st = setup(BASIC, opts);
    expect(st.phase).toBe('mao_de_10_decision');
    expect(st.hand.mode).toBe('mao_de_10');
    const v0 = getPlayerView(st, 0);
    expect(v0.partnerHand!.map((c) => c.id)).toEqual(BASIC[2]);
    expect(getPlayerView(st, 1).partnerHand).toBeNull();
    expect(getLegalActions(st, 1)).toEqual([]);
  });

  it('correr dá 2 pontos ao adversário', () => {
    const st = setup(BASIC, opts);
    const r = must(applyAction(st, 0, { type: 'mao10', play: false }));
    expect(r.state.scores).toEqual([10, 6]);
  });

  it('jogar vale 4 e esconde a mão do parceiro', () => {
    let st = setup(BASIC, opts);
    // dealer agora é 0 → assento 1 começa
    st = act(st, 2, { type: 'mao10', play: true });
    expect(st.phase).toBe('playing');
    expect(st.hand.value).toBe(4);
    expect(getPlayerView(st, 0).partnerHand).toBeNull();
  });

  it('truco bloqueado para todos e, se pedido, perde a mão', () => {
    let st = setup(BASIC, opts);
    st = act(st, 0, { type: 'mao10', play: true });
    const seat = st.hand.turn;
    expect(getLegalActions(st, seat).some((a) => a.type === 'truco')).toBe(false);
    const r = must(applyAction(st, seat, { type: 'truco' }));
    expect(r.events.some((e) => e.type === 'penalty')).toBe(true);
    expect(r.state.hand.result!.reason).toBe('penalty');
    // assento 1 (dupla B) pediu → dupla A ganha o valor da mão (4) e fecha a partida
    expect(r.state.scores).toEqual([14, 4]);
    expect(r.state.phase).toBe('match_over');
  });
});

describe('Mão de Ferro (10 a 10)', () => {
  it('cega: ninguém vê as próprias cartas, sem truco, vencedor fecha a partida', () => {
    let st = setup(BASIC, { scores: [10, 10] });
    expect(st.hand.mode).toBe('mao_de_ferro');
    expect(st.phase).toBe('playing');
    const v = getPlayerView(st, st.hand.turn);
    expect(v.myHand.every((c) => c === null)).toBe(true);
    expect(getLegalActions(st, st.hand.turn).some((a) => a.type === 'truco' || (a.type === 'play' && a.faceDown))).toBe(false);
    let guard = 0;
    while (st.phase === 'playing' && guard++ < 20) {
      st = must(applyAction(st, st.hand.turn, { type: 'play', index: 0 })).state;
    }
    // Se as 3 cangarem ninguém pontua; caso contrário alguém fecha 12.
    if (st.hand.result!.winnerTeam !== null) {
      expect(st.phase).toBe('match_over');
      expect(Math.max(...st.scores)).toBe(12);
    }
  });

  it('aberta: cartas visíveis, mas sem truco', () => {
    const st = setup(BASIC, { scores: [10, 10], config: { maoDeFerro: 'aberta' } });
    const v = getPlayerView(st, st.hand.turn);
    expect(v.myHand.every((c) => c !== null)).toBe(true);
    expect(getLegalActions(st, st.hand.turn).some((a) => a.type === 'truco')).toBe(false);
  });
});

describe('fim de partida', () => {
  it('capote quando o perdedor tem 0', () => {
    let st = setup(BASIC, { scores: [8, 0] });
    expect(st.hand.mode).toBe('normal');
    st = act(st, st.hand.turn, { type: 'truco' });
    // dealer=0, turn=1 (dupla B pediu). Dupla A aumenta para seis e B corre → A ganha 4 → 12.
    st = act(st, 0, { type: 'raise' });
    const r = must(applyAction(st, 1, { type: 'run' }));
    expect(r.state.scores).toEqual([12, 0]);
    expect(r.state.phase).toBe('match_over');
    expect(r.state.winner).toBe(0);
    expect(r.state.capote).toBe(true);
  });

  it('nenhuma ação é aceita após o fim', () => {
    let st = setup(BASIC, { scores: [8, 0] });
    st = act(st, st.hand.turn, { type: 'truco' });
    st = act(st, 0, { type: 'raise' });
    st = act(st, 1, { type: 'run' });
    for (const seat of [0, 1, 2, 3] as Seat[]) expect(getLegalActions(st, seat)).toEqual([]);
    expect(startNextHand(st).ok).toBe(false);
  });
});

describe('anti-trapaça: getPlayerView', () => {
  it('nunca expõe cartas de outros assentos', () => {
    const { state } = createMatch({}, 7);
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const v = getPlayerView(state, seat);
      const json = JSON.stringify(v);
      const mine = new Set(state.hand.hands[seat]!.map((c) => c.id));
      for (const other of [0, 1, 2, 3] as Seat[]) {
        if (other === seat) continue;
        for (const c of state.hand.hands[other]!) {
          if (!mine.has(c.id)) expect(json).not.toContain(`"${c.id}"`);
        }
      }
      expect(v.myHand.map((c) => c!.id)).toEqual(state.hand.hands[seat]!.map((c) => c.id));
    }
  });

  it('não expõe o estado do RNG', () => {
    const { state } = createMatch({}, 7);
    expect(JSON.stringify(getPlayerView(state, 0))).not.toContain('rngState');
  });
});

describe('embaralhamento determinístico', () => {
  it('mesma seed = mesmas mãos', () => {
    const a = createMatch({}, 99).state.hand.hands;
    const b = createMatch({}, 99).state.hand.hands;
    const c = createMatch({}, 100).state.hand.hands;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
