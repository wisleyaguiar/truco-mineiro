import {
  cardStrength,
  createDeck,
  decideHand,
  isManilha,
  partnerOf,
  teamOf,
  type Action,
  type Card,
  type PlayerView,
  type RoundWinner,
  type Team,
} from '@truco/engine';
import { PERSONALITIES, type Personality, type PersonalityId } from './personalities.ts';

// Distribuição de forças do baralho: fração de cartas estritamente mais fracas que `s`.
const DECK_STRENGTHS = createDeck().map((c) => cardStrength(c));
function weakerFraction(s: number): number {
  let n = 0;
  for (const x of DECK_STRENGTHS) if (x < s) n++;
  return n / (DECK_STRENGTHS.length - 1);
}

/** Probabilidade (aproximada) de uma carta de força `s` vencer `opponents` cartas desconhecidas. */
function beatsUnknown(s: number, opponents: number): number {
  return Math.pow(weakerFraction(s), opponents * 1.15);
}

const PARTNER_UNKNOWN = 0.3;

interface TableInfo {
  bestOpp: number; // -1 se nenhum adversário jogou
  bestPartner: number; // -1 se parceiro não jogou
  oppsToPlay: number;
  partnerToPlay: boolean;
}

function tableInfo(view: PlayerView): TableInfo {
  const round = view.rounds[view.currentRound];
  const plays = round?.plays ?? [];
  let bestOpp = -1;
  let bestPartner = -1;
  let oppsPlayed = 0;
  let partnerPlayed = false;
  for (const p of plays) {
    const st = p.card ? cardStrength(p.card, p.faceDown) : 0;
    if (teamOf(p.seat) === view.team) {
      if (p.seat === partnerOf(view.seat)) partnerPlayed = true;
      bestPartner = Math.max(bestPartner, st);
    } else {
      oppsPlayed++;
      bestOpp = Math.max(bestOpp, st);
    }
  }
  return { bestOpp, bestPartner, oppsToPlay: 2 - oppsPlayed, partnerToPlay: !partnerPlayed };
}

/** Chance da minha dupla levar a vaza atual jogando uma carta de força `s`. */
function roundChance(s: number, t: TableInfo): number {
  // Se o parceiro já está ganhando, consideramos a carta dele também.
  const mine = Math.max(s, t.bestPartner);
  let p = t.bestOpp >= mine ? 0 : beatsUnknown(mine, t.oppsToPlay);
  if (t.partnerToPlay) p = 1 - (1 - p) * (1 - PARTNER_UNKNOWN);
  return p;
}

/** Enumera vitórias/derrotas nas vazas futuras e usa as regras de canga do motor. */
function handChanceFrom(done: RoundWinner[], future: number[], us: Team): number {
  if (future.length === 0) {
    const d = decideHand(done);
    return d === us ? 1 : 0;
  }
  const decided = decideHand(done);
  if (decided !== null) return decided === us ? 1 : 0;
  const [p, ...rest] = future;
  const them = (1 - us) as Team;
  return p! * handChanceFrom([...done, us], rest, us) + (1 - p!) * handChanceFrom([...done, them], rest, us);
}

function myCards(view: PlayerView): Card[] {
  return view.myHand.filter((c): c is Card => c !== null);
}

/** Estimativa (0..1) de a minha dupla vencer a mão. */
export function estimateHandChance(view: PlayerView): number {
  const cards = myCards(view);
  if (cards.length === 0) return 0.5;
  const strengths = cards.map((c) => cardStrength(c)).sort((a, b) => b - a);
  const done = view.rounds.filter((r) => r.winner !== null).map((r) => r.winner!) as RoundWinner[];
  const t = tableInfo(view);
  const future: number[] = [];
  future.push(roundChance(strengths[0]!, t));
  const empty: TableInfo = { bestOpp: -1, bestPartner: -1, oppsToPlay: 2, partnerToPlay: true };
  for (let i = 1; i < strengths.length; i++) future.push(roundChance(strengths[i]!, empty));
  return handChanceFrom(done, future.slice(0, 3 - done.length), view.team);
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function playAction(view: PlayerView, legal: Action[], p: Personality, rng: () => number): Action {
  const plays = legal.filter((a): a is Extract<Action, { type: 'play' }> => a.type === 'play');
  const faceUp = plays.filter((a) => !a.faceDown);
  const canCover = plays.some((a) => a.faceDown);

  // Mão de Ferro cega: não vê nada, joga qualquer uma.
  if (view.myHand.some((c) => c === null)) return pick(faceUp, rng);

  const cards = view.myHand as Card[];
  const idx = cards.map((_, i) => i);
  const str = (i: number) => cardStrength(cards[i]!);
  const asc = [...idx].sort((a, b) => str(a) - str(b));
  const lowest = asc[0]!;
  const highest = asc[asc.length - 1]!;
  const t = tableInfo(view);
  const leading = (view.rounds[view.currentRound]?.plays.length ?? 0) === 0;
  const round = view.currentRound;
  const hasZap = cards.some((c) => c.id === '4-paus');

  const throwAway = (i: number): Action => {
    if (canCover && str(i) <= 6 && rng() < p.coverRate) return { type: 'play', index: i, faceDown: true };
    return { type: 'play', index: i };
  };

  if (leading) {
    if (round === 0) {
      if (asc.length >= 2) {
        const middle = asc[asc.length - 2]!;
        // "Cama": quem é desconfiado não abre com o Zap.
        if (p.cama && hasZap && cards[highest]!.id === '4-paus') return { type: 'play', index: middle };
        // Abre com manilha só se não tiver outra carta boa.
        if (isManilha(cards[highest]!) && str(middle) >= 7) return { type: 'play', index: middle };
      }
      return { type: 'play', index: highest };
    }
    return { type: 'play', index: highest };
  }

  // Parceiro ganhando a vaza
  if (t.bestPartner > t.bestOpp) {
    const partnerStrong = t.bestPartner >= 10;
    if (t.oppsToPlay === 0 || partnerStrong) return throwAway(lowest);
    // adversário ainda joga: reforça se tiver carta melhor que a do parceiro, sem gastar manilha à toa
    const better = asc.filter((i) => str(i) > t.bestPartner && str(i) >= 9);
    if (better.length && !isManilha(cards[better[0]!]!)) return { type: 'play', index: better[0]! };
    return throwAway(lowest);
  }

  // Precisa ganhar da maior carta adversária
  const winners = asc.filter((i) => str(i) > t.bestOpp);
  if (winners.length) {
    const w = winners[0]!;
    if (p.cama && round === 0 && cards[w]!.id === '4-paus' && winners.length === 1 && t.partnerToPlay) {
      return throwAway(lowest); // esconde o Zap, confia no parceiro
    }
    return { type: 'play', index: w };
  }
  const ties = asc.filter((i) => str(i) === t.bestOpp && t.bestOpp > 0);
  if (ties.length) return { type: 'play', index: ties[0]! }; // canga
  return throwAway(lowest);
}

function hasManilha(view: PlayerView): boolean {
  return myCards(view).some(isManilha);
}

function trucoDecision(view: PlayerView, p: Personality, rng: () => number): boolean {
  const chance = estimateHandChance(view);
  const cards = myCards(view);
  const allLow = cards.length > 0 && cards.every((c) => cardStrength(c) <= 3);
  // Mais agressivo quando o adversário está perto de ganhar (pouco a perder).
  const oppScore = view.scores[1 - view.team]!;
  const urgency = oppScore >= view.config.targetScore - 4 ? 0.06 : 0;
  // Cada degrau acima do Truco exige mais confiança (Seis, Dez, Doze).
  const level = Math.max(0, view.config.betLadder.indexOf(view.value));
  const need = p.askThreshold + level * 0.07 - urgency;
  if (chance >= need) return rng() < 0.6;
  // Blefe só no primeiro grito (Truco). Zé do Blefe gosta de gritar na última vaza com carta baixa.
  if (level > 0) return false;
  const lastRound = view.currentRound === 2;
  if (p.id === 'blefe' && (lastRound || allLow) && chance < 0.45) return rng() < p.bluffRate;
  return rng() < p.bluffRate * 0.25;
}

function responseDecision(view: PlayerView, legal: Action[], p: Personality, rng: () => number): Action {
  const bet = view.pendingBet!;
  const ladder = view.config.betLadder;
  const previous = ladder[ladder.indexOf(bet.value) - 1] ?? view.value;
  const oppTeam = (1 - view.team) as Team;
  const target = view.config.targetScore;
  let chance = estimateHandChance(view);
  // Desconfia de quem grita: puxa a estimativa para baixo um pouco.
  if (p.id === 'desconfiado') chance -= 0.04;
  if (p.id === 'blefe') chance += 0.04;

  const canRaise = legal.some((a) => a.type === 'raise');
  const raiseOk = !p.needsManilhaToRaise || hasManilha(view);
  const level = Math.max(0, ladder.indexOf(bet.value)); // 1 = respondendo a um Truco
  if (canRaise && raiseOk && chance >= p.raiseThreshold + (level - 1) * 0.06 && rng() < 0.7) return { type: 'raise' };

  // Se correr entrega a partida, aceita sempre.
  if (view.scores[oppTeam] + previous >= target) return { type: 'accept' };
  // Se aceitar e perder entrega a partida, exige um pouco mais.
  const risky = view.scores[oppTeam] + bet.value >= target ? 0.05 : 0;
  if (chance >= p.acceptThreshold + risky) return { type: 'accept' };
  // Zé do Blefe às vezes paga pra ver.
  if (p.id === 'blefe' && rng() < 0.2) return { type: 'accept' };
  return { type: 'run' };
}

function maoDe10Decision(view: PlayerView, p: Personality): boolean {
  const mine = myCards(view).map((c) => cardStrength(c));
  const partner = (view.partnerHand ?? []).map((c) => cardStrength(c));
  const a = mine.sort((x, y) => y - x);
  const b = partner.sort((x, y) => y - x);
  // Em cada vaza, a dupla usa a melhor carta disponível de cada um.
  const empty: TableInfo = { bestOpp: -1, bestPartner: -1, oppsToPlay: 2, partnerToPlay: false };
  const future = [0, 1, 2].map((i) => {
    const pa = roundChance(a[i] ?? 0, empty);
    const pb = roundChance(b[i] ?? 0, empty);
    return 1 - (1 - pa) * (1 - pb);
  });
  const chance = handChanceFrom([], future, view.team);
  // Correr: perde o valor base. Jogar: ganha/perde o valor da Mão de 10.
  const runCost = view.config.betLadder[0]!;
  const v = view.config.maoDe10Value;
  const evPlay = v * (2 * chance - 1);
  return evPlay > -runCost + p.maoDe10Margin;
}

/**
 * Decide a ação do bot. Recebe só a visão do jogador (sem trapaça) e as ações válidas.
 * Sempre retorna uma ação que está em `legal`.
 */
export function decideAction(
  view: PlayerView,
  legal: Action[],
  personality: Personality | PersonalityId = 'equilibrado',
  rng: () => number = Math.random,
): Action {
  if (legal.length === 0) throw new Error('Bot sem ações válidas');
  const p = typeof personality === 'string' ? PERSONALITIES[personality] : personality;

  if (view.phase === 'mao_de_10_decision') return { type: 'mao10', play: maoDe10Decision(view, p) };
  if (view.phase === 'bet_response') return responseDecision(view, legal, p, rng);

  if (legal.some((a) => a.type === 'truco') && trucoDecision(view, p, rng)) return { type: 'truco' };
  return playAction(view, legal, p, rng);
}

