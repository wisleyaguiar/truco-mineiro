import { cardStrength, teamOf } from './cards.ts';
import type { Play, RoundWinner, Seat, Team } from './types.ts';

/**
 * Resolve uma vaza completa (4 cartas).
 * - Maior força vence. Coberta vale 0.
 * - Se as maiores cartas forem de duplas diferentes → canga ('tie').
 * - Se as maiores forem da mesma dupla → essa dupla vence.
 * - winningSeat: quem fez a vaza (ou, na canga, quem jogou primeiro a maior carta),
 *   e é quem puxa a próxima vaza.
 */
export function resolveRound(plays: Play[]): { winner: RoundWinner; winningSeat: Seat } {
  if (plays.length === 0) throw new Error('Vaza vazia');
  let best = -1;
  for (const p of plays) best = Math.max(best, cardStrength(p.card, p.faceDown));
  const top = plays.filter((p) => cardStrength(p.card, p.faceDown) === best);
  const teams = new Set(top.map((p) => teamOf(p.seat)));
  const first = top[0]!;
  if (teams.size > 1) return { winner: 'tie', winningSeat: first.seat };
  return { winner: teamOf(first.seat), winningSeat: first.seat };
}

/**
 * Decide o vencedor da mão a partir dos resultados das vazas já disputadas.
 * Regras de canga (PRD 3.2):
 * - Empate na 1ª: quem vencer a 2ª leva.
 * - Empate na 2ª: leva quem ganhou a 1ª.
 * - Empate na 3ª: leva quem ganhou a 1ª.
 * - Empate nas 3: ninguém pontua.
 * Retorna:
 * - Team: mão decidida para essa dupla
 * - 'none': mão encerrada sem vencedor (3 cangas)
 * - null: mão ainda não decidida
 */
export function decideHand(results: RoundWinner[]): Team | 'none' | null {
  const [r1, r2, r3] = results;
  if (r1 === undefined || r2 === undefined) return null;

  if (r1 === 'tie') {
    if (r2 !== 'tie') return r2;
    if (r3 === undefined) return null;
    return r3 === 'tie' ? 'none' : r3;
  }
  // r1 tem vencedor
  if (r2 === 'tie' || r2 === r1) return r1;
  // 1 a 1
  if (r3 === undefined) return null;
  return r3 === 'tie' ? r1 : r3;
}
