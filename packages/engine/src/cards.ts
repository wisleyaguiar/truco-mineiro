import type { Card, Rank, Seat, Suit, Team } from './types.ts';

export const SUITS: readonly Suit[] = ['paus', 'copas', 'espadas', 'ouros'];
/** Ordem crescente de força das cartas comuns. */
export const RANKS: readonly Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

/** Manilhas fixas da Manilha Velha (id -> força). */
export const MANILHAS: Readonly<Record<string, number>> = {
  '4-paus': 14, // Zap / Gato
  '7-copas': 13, // Copeta
  'A-espadas': 12, // Espadilha
  '7-ouros': 11, // Pica-fumo / Moleque
};

export const MANILHA_NAMES: Readonly<Record<string, string>> = {
  '4-paus': 'Zap',
  '7-copas': 'Copeta',
  'A-espadas': 'Espadilha',
  '7-ouros': 'Pica-fumo',
};

/** Força máxima possível (Zap). */
export const MAX_STRENGTH = 14;

export function cardId(rank: Rank, suit: Suit): string {
  return `${rank}-${suit}`;
}

export function makeCard(rank: Rank, suit: Suit): Card {
  return { id: cardId(rank, suit), rank, suit };
}

/** Converte um id ("4-paus") em carta. */
export function parseCard(id: string): Card {
  const [rank, suit] = id.split('-') as [Rank, Suit];
  if (!RANKS.includes(rank) || !SUITS.includes(suit)) throw new Error(`Carta inválida: ${id}`);
  return makeCard(rank, suit);
}

/** Baralho de 40 cartas (sem 8, 9, 10 e coringas). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(makeCard(rank, suit));
  return deck;
}

/**
 * Força da carta: 1 (4 comum) até 10 (3) para comuns; 11..14 para manilhas.
 * Carta jogada coberta vale 0.
 */
export function cardStrength(card: Card, faceDown = false): number {
  if (faceDown) return 0;
  const manilha = MANILHAS[card.id];
  if (manilha !== undefined) return manilha;
  return RANKS.indexOf(card.rank) + 1;
}

export function isManilha(card: Card): boolean {
  return MANILHAS[card.id] !== undefined;
}

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team;
}

export function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function seatsOf(team: Team): [Seat, Seat] {
  return team === 0 ? [0, 2] : [1, 3];
}

export function otherTeam(team: Team): Team {
  return (1 - team) as Team;
}
