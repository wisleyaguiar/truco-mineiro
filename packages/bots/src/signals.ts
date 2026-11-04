// Sinais secretos (PRD 5.2): regras puras, sem DOM nem animação.
// Um sinal é uma *afirmação* ("tenho o Zap"). Pode ser blefe: quem recebe acredita.
import { cardStrength, partnerOf, teamOf, type Card, type PlayerView, type Seat } from '@truco/engine';
import type { Personality } from './personalities.ts';

export type SignalId = 'zap' | 'copeta' | 'espadilha' | 'picafumo' | 'tres' | 'cego';

export interface SignalInfo {
  id: SignalId;
  label: string;
  gesture: string;
  emoji: string;
  /** Força da carta que o sinal afirma ter. `cego` = "nada bom" (estimado como no máximo uma Dama). */
  strength: number;
}

export const SIGNALS: Record<SignalId, SignalInfo> = {
  zap: { id: 'zap', label: 'Zap', gesture: 'piscou um olho', emoji: '😉', strength: 14 },
  copeta: { id: 'copeta', label: 'Copeta', gesture: 'fez bico', emoji: '😗', strength: 13 },
  espadilha: { id: 'espadilha', label: 'Espadilha', gesture: 'mostrou a língua', emoji: '😛', strength: 12 },
  picafumo: { id: 'picafumo', label: 'Pica-fumo', gesture: 'encolheu o ombro', emoji: '🤷', strength: 11 },
  tres: { id: 'tres', label: 'Três', gesture: 'bateu 3 vezes nas cartas', emoji: '✋', strength: 10 },
  cego: { id: 'cego', label: 'Cego', gesture: 'fechou os olhos', emoji: '😑', strength: 5 },
};

export const SIGNAL_ORDER: SignalId[] = ['zap', 'copeta', 'espadilha', 'picafumo', 'tres', 'cego'];

const BY_CARD: Record<string, SignalId> = {
  '4-paus': 'zap',
  '7-copas': 'copeta',
  'A-espadas': 'espadilha',
  '7-ouros': 'picafumo',
};

/** Qual sinal corresponde a esta carta (null se a carta não tem sinal próprio). */
export function signalOfCard(card: Card): SignalId | null {
  return BY_CARD[card.id] ?? (card.rank === '3' ? 'tres' : null);
}

/** Sinal "honesto" para uma mão: a melhor carta sinalizável, ou `cego` se não tiver nenhuma. */
export function honestSignals(cards: Card[]): SignalId[] {
  const sigs = cards
    .map(signalOfCard)
    .filter((s): s is SignalId => s !== null)
    .sort((a, b) => SIGNALS[b].strength - SIGNALS[a].strength);
  return sigs.length ? sigs : ['cego'];
}

// ---------- Conhecimento (o que cada jogador acredita sobre os outros) ----------

/** Afirmações recebidas por assento, na mão atual. */
export type Knowledge = Partial<Record<Seat, SignalId[]>>;

export function createKnowledge(): Knowledge {
  return {};
}

/** Registra que `seat` afirmou ter `signal`. Muta e devolve `k`. */
export function learn(k: Knowledge, seat: Seat, signal: SignalId): Knowledge {
  const list = (k[seat] ??= []);
  if (signal === 'cego') {
    if (!list.length) list.push('cego');
  } else {
    const i = list.indexOf('cego');
    if (i >= 0) list.splice(i, 1);
    if (!list.includes(signal)) list.push(signal);
  }
  return k;
}

/**
 * Quando `seat` joga uma carta, a afirmação correspondente sai da memória
 * (ou a mais forte, se a carta não bate com nenhuma — o sinal era blefe, ou já foi usado).
 * Se não sobrou carta na mão dele, esquece tudo.
 */
export function forgetPlayed(k: Knowledge, seat: Seat, card: Card | null, cardsLeft: number): Knowledge {
  const list = k[seat];
  if (!list) return k;
  if (cardsLeft === 0) {
    delete k[seat];
    return k;
  }
  if (!card) return k;
  const sig = signalOfCard(card);
  const i = sig ? list.indexOf(sig) : -1;
  if (i >= 0) list.splice(i, 1);
  else if (cardStrength(card) >= 10) {
    // jogou carta forte que não tinha sinalizado: nada a remover
  }
  if (!list.length) delete k[seat];
  return k;
}

/** Maior força que acreditamos que `seat` ainda tem (null = não sabemos). */
export function believedBest(k: Knowledge | undefined, seat: Seat): number | null {
  const list = k?.[seat];
  if (!list || !list.length) return null;
  return Math.max(...list.map((s) => SIGNALS[s].strength));
}

// ---------- Olhar e interceptação ----------

/** Para onde cada assento está olhando agora (null = olhando a mesa / as próprias cartas). */
export type Gaze = Partial<Record<Seat, Seat | null>>;

/** Adversários do sinalizador que estavam olhando para ele no instante do sinal. */
export function whoIntercepts(signaler: Seat, gaze: Gaze): Seat[] {
  const out: Seat[] = [];
  for (const s of [0, 1, 2, 3] as Seat[]) {
    if (teamOf(s) !== teamOf(signaler) && gaze[s] === signaler) out.push(s);
  }
  return out;
}

/** Quem recebe o sinal: o parceiro sempre, mais os adversários que interceptaram. */
export function receiversOf(signaler: Seat, gaze: Gaze): { partner: Seat; interceptors: Seat[] } {
  return { partner: partnerOf(signaler), interceptors: whoIntercepts(signaler, gaze) };
}

/**
 * Próximo alvo do olhar de um bot. Desconfiado vigia mais os adversários.
 * null = olhando para a mesa (janela segura para os outros sinalizarem).
 */
export function nextGazeTarget(seat: Seat, p: Personality, rng: () => number): Seat | null {
  const opps = ([0, 1, 2, 3] as Seat[]).filter((s) => teamOf(s) !== teamOf(seat));
  const partner = partnerOf(seat);
  const wOpp = p.id === 'desconfiado' ? 0.34 : p.id === 'blefe' ? 0.18 : 0.24;
  const wPartner = p.id === 'blefe' ? 0.24 : 0.2;
  const r = rng();
  if (r < wOpp) return opps[0]!;
  if (r < 2 * wOpp) return opps[1]!;
  if (r < 2 * wOpp + wPartner) return partner;
  return null;
}

/** Quanto tempo (ms) o olhar fica no alvo. */
export function gazeDuration(rng: () => number): number {
  return 1500 + rng() * 2500;
}

/**
 * O bot decide se manda um sinal agora (e qual). null = não sinaliza neste momento.
 * - Honesto por padrão (melhor carta sinalizável, ou `cego`).
 * - Só manda cada afirmação uma vez por mão.
 * - Cuidado com quem está olhando: Desconfiado nunca sinaliza vigiado; Zé do Blefe é descuidado.
 * - Zé do Blefe às vezes manda sinal falso quando está cego.
 */
export function decideSignal(view: PlayerView, gaze: Gaze, p: Personality, rng: () => number, sent: SignalId[]): SignalId | null {
  if (view.mode !== 'normal' || view.phase !== 'playing') return null;
  const cards = view.myHand.filter((c): c is Card => c !== null);
  if (!cards.length) return null;
  let candidates = honestSignals(cards).filter((s) => !sent.includes(s));
  if (!candidates.length) return null;
  if (candidates[0] === 'cego' && p.id === 'blefe' && rng() < 0.2 && !sent.includes('copeta')) candidates = ['copeta'];
  const watched = whoIntercepts(view.seat, gaze).length > 0;
  if (watched) {
    const recklessness = p.id === 'blefe' ? 0.45 : p.id === 'equilibrado' ? 0.08 : 0;
    if (rng() >= recklessness) return null;
  }
  return candidates[0]!;
}
