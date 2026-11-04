import { partnerOf, teamOf } from './cards.ts';
import type { MatchState, PlayerView, Seat } from './types.ts';

/**
 * Visão de um jogador: só as próprias cartas + informação pública.
 * É isto que o servidor enviaria ao cliente (e o que os bots recebem).
 */
export function getPlayerView(state: MatchState, seat: Seat): PlayerView {
  const hand = state.hand;
  const team = teamOf(seat);
  const blind = hand.mode === 'mao_de_ferro' && state.config.maoDeFerro === 'cega';

  const showPartner = state.phase === 'mao_de_10_decision' && hand.maoDe10Team === team;

  return {
    seat,
    team,
    scores: [state.scores[0], state.scores[1]],
    phase: state.phase,
    handNumber: hand.number,
    dealer: hand.dealer,
    mode: hand.mode,
    value: hand.value,
    myHand: hand.hands[seat]!.map((c) => (blind ? null : { ...c })),
    partnerHand: showPartner ? hand.hands[partnerOf(seat)]!.map((c) => ({ ...c })) : null,
    handCounts: [hand.hands[0]!.length, hand.hands[1]!.length, hand.hands[2]!.length, hand.hands[3]!.length],
    rounds: hand.rounds.map((r) => ({
      plays: r.plays.map((p) => ({ seat: p.seat, card: p.faceDown ? null : { ...p.card }, faceDown: p.faceDown })),
      winner: r.winner,
      winningSeat: r.winningSeat,
    })),
    currentRound: hand.currentRound,
    turn: hand.turn,
    pendingBet: hand.pendingBet
      ? { value: hand.pendingBet.value, byTeam: hand.pendingBet.byTeam, bySeat: hand.pendingBet.bySeat }
      : null,
    lastRaiser: hand.lastRaiser,
    maoDe10Team: hand.maoDe10Team,
    result: hand.result ? { ...hand.result } : null,
    winner: state.winner,
    config: { ...state.config, betLadder: [...state.config.betLadder] },
  };
}
