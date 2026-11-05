// Liga motor de regras + bots + palco 3D + HUD.
// O motor roda localmente no modo solo, mas a interface é a mesma de um servidor autoritativo:
// o cliente só envia intenções (applyAction) e só enxerga getPlayerView(state, 0).
import {
  applyAction,
  betLabel,
  betName,
  createMatch,
  getLegalActions,
  getPlayerView,
  nextBetValue,
  seatsToAct,
  startNextHand,
  teamOf,
  type Action,
  type GameEvent,
  type MatchState,
  type Seat,
} from '@truco/engine';
import { decideAction, PERSONALITIES, SIGNALS, type PersonalityId, type SignalId } from '@truco/bots';
import * as sfx from '../audio/sfx.ts';
import type { Hud } from '../hud/hud.ts';
import type { Stage } from '../scene/stage.ts';
import { SignalDirector } from './signals.ts';
import { betLine, line } from './voice.ts';

const HUMAN: Seat = 0;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface Player {
  name: string;
  personality: PersonalityId | null; // null = humano
}

export const PLAYERS: Record<Seat, Player> = {
  0: { name: 'Você', personality: null },
  1: { name: 'Zé do Blefe', personality: 'blefe' },
  2: { name: 'Chico Mineiro', personality: 'equilibrado' },
  3: { name: 'Tião Desconfiado', personality: 'desconfiado' },
};

export class Controller {
  state!: MatchState;
  private busy = false;
  private coverOn = false;
  private pendingHumanIndex: number | null = null;
  private botToken = 0;
  private botPending = false;
  private botPendingSince = 0;
  private dealingNext = false;
  private watchdog = 0;
  /** Multiplica os atrasos (testes automatizados usam valor baixo). */
  speed = 1;
  readonly signals: SignalDirector;

  constructor(
    private readonly stage: Stage,
    private readonly hud: Hud,
  ) {
    this.signals = new SignalDirector({
      getState: () => this.state ?? null,
      speed: () => this.speed,
      personalityOf: (seat) => PLAYERS[seat].personality ?? 'equilibrado',
      nameOf: (seat) => PLAYERS[seat].name,
      setGaze: (seat, target) => this.stage.setGaze(seat, target),
      gesture: (seat, sig) => this.stage.gesture(seat, sig),
      onWatchingChange: (seat, watching) => this.hud.setWatching(seat, watching),
      onHumanSignal: (sig, caught) => this.onHumanSignalDone(sig, caught),
      onBotSignal: (seat, sig, caught) => this.onBotSignalDone(seat, sig, caught),
    });
  }

  // ---------- sinais ----------

  onSignal(sig: SignalId) {
    if (!this.state) return;
    if (!this.signals.humanSignal(sig)) {
      const mode = this.state.hand.mode;
      this.hud.toast(mode !== 'normal' ? 'Nessa mão não tem sinal.' : 'Calma, espera um pouquinho pra sinalizar de novo.', 'info', 1400);
    }
    this.refresh();
  }

  private onHumanSignalDone(sig: SignalId, caught: Seat[]) {
    const info = SIGNALS[sig];
    this.hud.say(HUMAN, `${info.emoji} você ${info.gesture}`, false, 1500);
    if (caught.length) {
      const names = caught.map((s) => PLAYERS[s].name).join(' e ');
      this.hud.toast(`${names} ${caught.length > 1 ? 'pegaram' : 'pegou'} seu sinal!`, 'bad', 2000);
      this.hud.say(caught[0]!, line('caught'));
    } else {
      this.hud.toast(`${PLAYERS[2].name} viu seu sinal`, 'good', 1200);
    }
  }

  private onBotSignalDone(seat: Seat, sig: SignalId, caught: Seat[]) {
    this.hud.pop(seat, SIGNALS[sig].emoji);
    const botCatcher = caught.find((s) => s !== HUMAN);
    if (botCatcher !== undefined && Math.random() < 0.5) {
      window.setTimeout(() => this.hud.say(botCatcher, line('caught')), 700);
    }
  }

  private delay(ms: number) {
    return sleep(ms * this.speed);
  }

  get view() {
    return getPlayerView(this.state, HUMAN);
  }

  async start(seed = Math.floor(Math.random() * 2 ** 31)) {
    const { state, events } = createMatch({}, seed);
    this.state = state;
    this.coverOn = false;
    this.botToken++;
    this.botPending = false;
    this.startWatchdog();
    this.signals.start();
    this.refresh();
    await this.run(events);
  }

  // ---------- entrada do humano ----------

  onCardClick(index: number, rightClick: boolean) {
    if (this.busy || !this.isHumanTurn()) return;
    const legal = getLegalActions(this.state, HUMAN);
    const wantCover = rightClick || this.coverOn;
    const action = legal.find((a) => a.type === 'play' && a.index === index && !!a.faceDown === wantCover);
    if (!action) {
      if (wantCover) this.hud.toast('Coberta só a partir da 2ª rodada', 'info', 1400);
      return;
    }
    this.pendingHumanIndex = index;
    this.coverOn = false;
    void this.act(HUMAN, action);
  }

  onTruco() {
    if (this.busy || !this.isHumanTurn()) return;
    if (!getLegalActions(this.state, HUMAN).some((a) => a.type === 'truco')) return;
    void this.act(HUMAN, { type: 'truco' });
  }

  onToggleCover() {
    this.coverOn = !this.coverOn;
    this.refresh();
  }

  onRespond(r: 'accept' | 'run' | 'raise') {
    if (this.busy || this.state.phase !== 'bet_response') return;
    void this.act(HUMAN, { type: r });
  }

  onMao10(play: boolean) {
    if (this.busy || this.state.phase !== 'mao_de_10_decision') return;
    void this.act(HUMAN, { type: 'mao10', play });
  }

  private isHumanTurn() {
    return this.state.phase === 'playing' && this.state.hand.turn === HUMAN;
  }

  // ---------- laço principal ----------

  private async act(seat: Seat, action: Action) {
    const r = applyAction(this.state, seat, action);
    if (!r.ok) {
      console.warn('Ação inválida', seat, action, r.error);
      this.hud.toast(r.error, 'bad');
      this.busy = false;
      this.schedule();
      return;
    }
    this.state = r.state;
    await this.run(r.events);
  }

  /** Evento sendo animado agora (diagnóstico de travamentos). */
  currentAnim: { type: string; seat?: number; since: number } | null = null;

  private async run(events: GameEvent[]) {
    this.busy = true;
    this.stage.setInteractive(false);
    this.hud.hideModal();
    try {
      for (const e of events) {
        this.currentAnim = { type: e.type, seat: 'seat' in e ? e.seat : undefined, since: performance.now() };
        // Rede de segurança: uma animação nunca pode travar o jogo.
        let timer = 0;
        const timeout = new Promise<'timeout'>((r) => (timer = window.setTimeout(() => r('timeout'), 10000)));
        const res = await Promise.race([this.animate(e).then(() => 'ok' as const), timeout]);
        clearTimeout(timer);
        if (res === 'timeout') console.warn('Animação travou e foi pulada:', e.type, JSON.stringify(e));
      }
    } catch (err) {
      console.error('Erro ao animar evento', this.currentAnim, err);
    } finally {
      this.currentAnim = null;
      this.busy = false;
    }
    this.refresh();
    this.schedule();
  }

  /** Decide quem age agora: humano (libera UI) ou bot (agenda jogada). */
  private schedule() {
    const st = this.state;
    if (st.phase === 'match_over') return;
    if (st.phase === 'hand_over') {
      void this.nextHand();
      return;
    }
    const seats = seatsToAct(st);
    const humanTeam = teamOf(HUMAN);
    const view = this.view;

    if (st.phase === 'bet_response' && teamOf(seats[0]!) === humanTeam) {
      const bet = view.pendingBet!;
      const ladder = st.config.betLadder;
      const next = nextBetValue(bet.value, ladder);
      this.hud.showBet({
        from: PLAYERS[bet.bySeat].name,
        label: betLabel(betName(bet.value, ladder)),
        value: bet.value,
        previous: ladder[ladder.indexOf(bet.value) - 1] ?? view.value,
        raiseLabel: next !== null ? betLabel(betName(next, ladder)) : null,
      });
      return;
    }
    if (st.phase === 'mao_de_10_decision' && st.hand.maoDe10Team === humanTeam) {
      this.hud.showMao10(
        view.myHand.filter((c) => c !== null),
        view.partnerHand ?? [],
        PLAYERS[2].name,
        st.config.maoDe10Value,
        st.config.betLadder[0]!,
      );
      return;
    }
    if (st.phase === 'playing' && st.hand.turn === HUMAN) {
      this.stage.setTurn(HUMAN);
      this.stage.setInteractive(true);
      return;
    }
    // Vez de um bot
    const seat = seats[0]!;
    const player = PLAYERS[seat];
    const thinking = st.phase === 'playing' ? 700 + Math.random() * 800 : 900 + Math.random() * 700;
    const token = ++this.botToken;
    this.botPending = true;
    this.botPendingSince = performance.now();
    void this.delay(thinking).then(() => {
      if (token !== this.botToken) return; // outro agendamento substituiu este
      this.botPending = false;
      if (this.state !== st || this.busy) return; // estado mudou nesse meio tempo
      let action: Action;
      try {
        const legal = getLegalActions(st, seat);
        action = decideAction(
          getPlayerView(st, seat),
          legal,
          PERSONALITIES[player.personality ?? 'equilibrado'],
          Math.random,
          this.signals.knowledgeFor(seat),
        );
      } catch (err) {
        console.error('Erro na decisão do bot', seat, err);
        action = getLegalActions(st, seat)[0]!;
      }
      void this.act(seat, action);
    });
  }

  /**
   * Proteção contra travamento: se ninguém agir por alguns segundos num momento de bot,
   * reagenda a jogada. Não deve disparar em condições normais (loga um aviso se disparar).
   */
  private startWatchdog() {
    if (this.watchdog) return;
    let last = this.state;
    let since = performance.now();
    this.watchdog = window.setInterval(() => {
      if (!this.state || this.state !== last) {
        last = this.state;
        since = performance.now();
        return;
      }
      const idle = performance.now() - since;
      const phase = this.state.phase;
      const pendingStale = this.botPending && performance.now() - this.botPendingSince > 6000;
      if (this.busy || (this.botPending && !pendingStale) || phase === 'match_over' || phase === 'hand_over') return;
      const humanActs = seatsToAct(this.state).some((s) => teamOf(s) === teamOf(HUMAN) && (phase !== 'playing' || s === HUMAN));
      if (humanActs) return;
      if (idle > 4000 * Math.max(this.speed, 0.5)) {
        console.warn('Watchdog: reagendando jogada do bot', phase);
        since = performance.now();
        this.schedule();
      }
    }, 1000);
  }

  private async nextHand() {
    if (this.dealingNext) return; // nunca distribui duas vezes ao mesmo tempo
    this.dealingNext = true;
    this.busy = true;
    let events: GameEvent[] | null = null;
    try {
      await this.delay(900);
      const r = startNextHand(this.state);
      if (r.ok) {
        await this.stage.clearTable(r.state.hand.dealer);
        this.state = r.state;
        events = r.events;
      }
    } finally {
      this.dealingNext = false;
    }
    if (events) await this.run(events);
    else this.busy = false;
  }

  // ---------- animação de cada evento ----------

  private async animate(e: GameEvent) {
    const usTeam = teamOf(HUMAN);
    switch (e.type) {
      case 'hand_started': {
        this.stage.setTurn(null);
        this.refresh();
        await this.stage.deal(e.dealer, this.view.myHand, () => sfx.cardSlide());
        this.signals.onHandStarted();
        if (e.mode === 'mao_de_10') {
          this.hud.toast(e.maoDe10Team === usTeam ? 'Mão de 10! Nós decidimos.' : 'Mão de 10 deles!', 'info', 1800);
          if (e.maoDe10Team === usTeam) this.hud.say(2, line('mao10'));
          await this.delay(900);
        } else if (e.mode === 'mao_de_ferro') {
          this.hud.toast('MÃO DE FERRO! 10 a 10, todo mundo no escuro.', 'info', 2600);
          this.hud.say(2, line('ferro'));
          await this.delay(1500);
        }
        break;
      }

      case 'card_played': {
        const isZap = e.card?.id === '4-paus';
        if (e.seat === HUMAN) {
          this.stage.setTurn(null);
          await this.stage.playHuman(this.pendingHumanIndex ?? 0, e.faceDown, e.card);
          this.pendingHumanIndex = null;
        } else {
          this.stage.setTurn(e.seat);
          await this.stage.playBot(e.seat, e.card, e.faceDown);
        }
        this.signals.onCardPlayed(e.seat, e.card, this.state.hand.hands[e.seat]!.length);
        sfx.cardSnap(isZap);
        if (isZap) {
          this.stage.shake(1.4);
          sfx.tableSlap(2);
          this.hud.say(e.seat, line('zap'), true);
          this.stage.nod(e.seat, true);
          await this.delay(500);
        }
        this.refresh();
        break;
      }

      case 'round_ended': {
        this.stage.setTurn(null);
        const plays = this.state.hand.rounds[e.round]?.plays ?? [];
        const winnerIndex = e.winningSeat !== null ? plays.findIndex((p) => p.seat === e.winningSeat) : null;
        this.hud.setRoundDot(e.round, e.winner, usTeam);
        if (e.winner === 'tie') this.hud.say(e.winningSeat ?? 0, line('canga'));
        await this.stage.collectRound(e.winningSeat, e.winner === 'tie', winnerIndex);
        if (this.state.phase === 'playing' && this.state.hand.currentRound > e.round) this.signals.onRoundStarted();
        break;
      }

      case 'bet_called': {
        const intensity = e.name === 'truco' ? 1 : e.name === 'seis' ? 1.5 : e.name === 'dez' ? 2 : 2.6;
        sfx.tableSlap(intensity);
        this.stage.shake(intensity);
        this.stage.nod(e.seat, true);
        this.hud.say(e.seat, e.seat === HUMAN ? `${betLabel(e.name)}` : betLine(e.name), true, 2600);
        this.refresh();
        await this.delay(900);
        break;
      }

      case 'bet_accepted':
        this.hud.say(e.seat, line('accept'));
        this.stage.nod(e.seat);
        this.refresh();
        await this.delay(700);
        break;

      case 'bet_run': {
        this.hud.say(e.seat, line('run'));
        await this.delay(700);
        const replier = ((e.seat + 1) % 4) as Seat;
        if (replier !== HUMAN) this.hud.say(replier, line('run_reply'));
        await this.delay(500);
        break;
      }

      case 'mao10_decision':
        this.hud.say(e.seat, line(e.play ? 'mao10_play' : 'mao10_run'));
        await this.delay(800);
        break;

      case 'penalty':
        this.hud.toast(`${PLAYERS[e.seat].name} pediu truco na Mão de 10 e perdeu a mão!`, 'bad', 2400);
        await this.delay(1200);
        break;

      case 'hand_ended': {
        const r = e.result;
        sfx.tentos(r.points);
        if (r.winnerTeam === null) this.hud.toast('Cangou tudo! Ninguém pontua.', 'info');
        else if (r.winnerTeam === usTeam) this.hud.toast(`Nós +${r.points} ${r.points === 1 ? 'tento' : 'tentos'}`, 'good');
        else this.hud.toast(`Eles +${r.points} tentos`, 'bad');
        this.hud.setScores(e.scores[usTeam], e.scores[1 - usTeam]!);
        await this.delay(1300);
        break;
      }

      case 'match_ended': {
        const win = e.winner === usTeam;
        this.signals.onMatchEnded();
        sfx.jingle(win);
        await this.delay(600);
        this.hud.showEnd(win, e.scores[usTeam], e.scores[1 - usTeam]!, e.capote);
        break;
      }
    }
  }

  // ---------- HUD ----------

  refresh() {
    if (!this.state) return;
    const view = this.view;
    const legal = this.busy ? [] : getLegalActions(this.state, HUMAN);
    const canTruco = legal.some((a) => a.type === 'truco');
    const canCover = legal.some((a) => a.type === 'play' && a.faceDown);
    const next = nextBetValue(view.value, view.config.betLadder);
    const trucoLabel = next !== null ? betLabel(betName(next, view.config.betLadder)) : 'DOZE!';
    const myTurn = !this.busy && this.isHumanTurn();
    let status = '';
    if (view.phase === 'playing') {
      status = view.turn === HUMAN ? (view.mode === 'mao_de_ferro' ? 'Sua vez: escolha uma carta no escuro' : 'Sua vez') : `Vez de ${PLAYERS[view.turn].name}`;
    } else if (view.phase === 'bet_response') {
      status = teamOf(seatsToAct(this.state)[0]!) === teamOf(HUMAN) ? 'Responda o desafio' : 'Esperando resposta...';
    } else if (view.phase === 'mao_de_10_decision') {
      status = view.maoDe10Team === view.team ? 'Mão de 10: decida' : 'Eles estão decidindo a Mão de 10...';
    }
    const canSignal = view.mode === 'normal' && (view.phase === 'playing' || view.phase === 'bet_response');
    this.hud.render(view, { myTurn, canTruco, trucoLabel, canCover, coverOn: this.coverOn, status, canSignal });
  }
}
