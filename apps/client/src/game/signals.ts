// Coordena os sinais secretos na mesa: olhar dos bots, sinais dos bots, sinais do humano,
// interceptação e a memória (Knowledge) que cada bot usa para decidir.
import { getPlayerView, teamOf, type Card, type MatchState, type Seat } from '@truco/engine';
import {
  createKnowledge,
  decideSignal,
  forgetPlayed,
  gazeDuration,
  learn,
  nextGazeTarget,
  PERSONALITIES,
  receiversOf,
  SIGNALS,
  type Gaze,
  type Knowledge,
  type PersonalityId,
  type SignalId,
} from '@truco/bots';

const HUMAN: Seat = 0;
const BOTS: Seat[] = [1, 2, 3];

export interface SignalHost {
  getState(): MatchState | null;
  speed(): number;
  personalityOf(seat: Seat): PersonalityId;
  nameOf(seat: Seat): string;
  setGaze(seat: Seat, target: Seat | null): void;
  gesture(seat: Seat, signal: SignalId): Promise<void>;
  /** Avisos para o humano. */
  onWatchingChange(seat: Seat, watchingYou: boolean): void;
  onHumanSignal(signal: SignalId, interceptedBy: Seat[]): void;
  onBotSignal(seat: Seat, signal: SignalId, interceptedBy: Seat[]): void;
}

export class SignalDirector {
  readonly gaze: Gaze = { 0: null, 1: null, 2: null, 3: null };
  private knowledge: Record<Seat, Knowledge> = { 0: {}, 1: {}, 2: {}, 3: {} };
  private sent: Record<Seat, SignalId[]> = { 0: [], 1: [], 2: [], 3: [] };
  private gazeTimers = new Map<Seat, number>();
  private attemptTimers: number[] = [];
  private handToken = 0;
  private humanCooldownUntil = 0;
  private running = false;
  /** Força um assento a olhar para um alvo fixo (usado em testes). */
  private pinned = new Map<Seat, Seat | null>();

  constructor(private readonly host: SignalHost) {}

  private ms(x: number) {
    return x * Math.max(this.host.speed(), 0.1);
  }

  start() {
    if (this.running) return;
    this.running = true;
    for (const seat of BOTS) this.scheduleGaze(seat, 300 + Math.random() * 1500);
  }

  stop() {
    this.running = false;
    for (const t of this.gazeTimers.values()) clearTimeout(t);
    this.gazeTimers.clear();
    this.clearAttempts();
  }

  private scheduleGaze(seat: Seat, delay: number) {
    clearTimeout(this.gazeTimers.get(seat));
    this.gazeTimers.set(
      seat,
      window.setTimeout(() => {
        if (!this.running) return;
        const pinned = this.pinned.has(seat);
        const target = pinned ? this.pinned.get(seat)! : nextGazeTarget(seat, PERSONALITIES[this.host.personalityOf(seat)], Math.random);
        this.setGaze(seat, target);
        this.scheduleGaze(seat, gazeDuration(Math.random));
      }, delay),
    );
  }

  private setGaze(seat: Seat, target: Seat | null) {
    this.gaze[seat] = target;
    this.host.setGaze(seat, target);
    if (teamOf(seat) !== teamOf(HUMAN)) this.host.onWatchingChange(seat, target === HUMAN);
  }

  /** Testes: fixa (ou solta, com undefined) o olhar de um bot. */
  pinGaze(seat: Seat, target: Seat | null | undefined) {
    if (target === undefined) {
      this.pinned.delete(seat);
      return;
    }
    this.pinned.set(seat, target);
    this.setGaze(seat, target);
  }

  knowledgeFor(seat: Seat): Knowledge {
    return this.knowledge[seat];
  }

  // ---------- ciclo da mão ----------

  onHandStarted() {
    this.handToken++;
    this.clearAttempts();
    for (const s of [0, 1, 2, 3] as Seat[]) {
      this.knowledge[s] = createKnowledge();
      this.sent[s] = [];
    }
    this.planBotAttempts(600, 2600);
  }

  /** No começo de cada vaza, os bots podem sinalizar de novo (o que ainda não sinalizaram). */
  onRoundStarted() {
    this.planBotAttempts(200, 1500);
  }

  onCardPlayed(seat: Seat, card: Card | null, cardsLeft: number) {
    for (const s of [0, 1, 2, 3] as Seat[]) forgetPlayed(this.knowledge[s], seat, card, cardsLeft);
  }

  onMatchEnded() {
    this.clearAttempts();
  }

  private clearAttempts() {
    for (const t of this.attemptTimers) clearTimeout(t);
    this.attemptTimers = [];
  }

  /** Cada bot tenta sinalizar algumas vezes; só sinaliza quando a hora parece segura. */
  private planBotAttempts(minDelay: number, maxDelay: number) {
    const token = this.handToken;
    for (const seat of BOTS) {
      let tries = 0;
      const attempt = () => {
        if (!this.running || token !== this.handToken) return;
        if (this.tryBotSignal(seat) || ++tries >= 6) return;
        this.attemptTimers.push(window.setTimeout(attempt, this.ms(700 + Math.random() * 700)));
      };
      this.attemptTimers.push(window.setTimeout(attempt, this.ms(minDelay + Math.random() * (maxDelay - minDelay))));
    }
  }

  private tryBotSignal(seat: Seat): boolean {
    const st = this.host.getState();
    if (!st || st.phase !== 'playing' || st.hand.mode !== 'normal') return false;
    if (st.hand.hands[seat]!.length === 0) return true;
    const p = PERSONALITIES[this.host.personalityOf(seat)];
    const sig = decideSignal(getPlayerView(st, seat), this.gaze, p, Math.random, this.sent[seat]);
    if (!sig) return false;
    this.emit(seat, sig);
    return true;
  }

  /** O humano pode sinalizar? (mão normal em andamento, fora do intervalo entre sinais) */
  canHumanSignal(): boolean {
    const st = this.host.getState();
    if (!st || st.hand.mode !== 'normal') return false;
    if (st.phase !== 'playing' && st.phase !== 'bet_response') return false;
    return performance.now() >= this.humanCooldownUntil;
  }

  humanSignal(sig: SignalId): boolean {
    if (!this.canHumanSignal()) return false;
    this.humanCooldownUntil = performance.now() + 2000;
    this.emit(HUMAN, sig);
    return true;
  }

  private emit(signaler: Seat, sig: SignalId) {
    this.sent[signaler].push(sig);
    const { partner, interceptors } = receiversOf(signaler, this.gaze);
    // Parceiro sempre recebe; adversários que estavam olhando também (e acreditam).
    learn(this.knowledge[partner], signaler, sig);
    for (const s of interceptors) learn(this.knowledge[s], signaler, sig);
    if (signaler === HUMAN) {
      this.host.onHumanSignal(sig, interceptors);
    } else {
      void this.host.gesture(signaler, sig);
      this.host.onBotSignal(signaler, sig, interceptors);
    }
  }

  describe(sig: SignalId) {
    return SIGNALS[sig];
  }
}
