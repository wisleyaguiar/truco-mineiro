// HUD em DOM/CSS sobre o canvas 3D.
import type { Card, PlayerView, RoundWinner, Seat, Team } from '@truco/engine';
import { SIGNAL_ORDER, SIGNALS, type SignalId } from '@truco/bots';
import { cardImageURL } from '../scene/cardArt.ts';

export interface HudHandlers {
  onStart: () => void;
  onRestart: () => void;
  onTruco: () => void;
  onToggleCover: () => void;
  onRespond: (r: 'accept' | 'run' | 'raise') => void;
  onMao10: (play: boolean) => void;
  onToggleMute: () => boolean;
  onSignal: (s: SignalId) => void;
  /** Abre o menu do modo online (login, apelido, partida, histórico). */
  onOnline: () => void;
  /** Volta para a tela inicial. */
  onMenu: () => void;
}

export interface HudState {
  myTurn: boolean;
  canTruco: boolean;
  trucoLabel: string;
  canCover: boolean;
  coverOn: boolean;
  status: string;
  canSignal: boolean;
}

type Anchor = (seat: Seat) => { x: number; y: number; visible: boolean };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export class Hud {
  private root: HTMLElement;
  private scoreUs!: HTMLElement;
  private scoreThem!: HTMLElement;
  private valueEl!: HTMLElement;
  private modeEl!: HTMLElement;
  private dots: HTMLElement[] = [];
  private tags = new Map<Seat, HTMLElement>();
  private bubbles = new Map<Seat, HTMLElement>();
  private bubbleTimers = new Map<Seat, number>();
  private statusEl!: HTMLElement;
  private trucoBtn!: HTMLButtonElement;
  private coverBtn!: HTMLButtonElement;
  private muteBtn!: HTMLButtonElement;
  private signalBtn!: HTMLButtonElement;
  private wheel!: HTMLElement;
  private pops = new Map<Seat, HTMLElement>();
  private modal!: HTMLElement;
  private toastEl!: HTMLElement;
  private toastTimer = 0;
  private anchor: Anchor | null = null;

  constructor(
    container: HTMLElement,
    private readonly h: HudHandlers,
  ) {
    this.root = el('div', 'hud');
    container.appendChild(this.root);
    this.build();
    const loop = () => {
      this.positionAnchors();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private build() {
    // Placar
    const board = el('div', 'board');
    board.innerHTML = `
      <div class="team us"><span class="label">Nós</span><span class="pts" data-us>0</span></div>
      <div class="center">
        <div class="dots"><i></i><i></i><i></i></div>
        <div class="value">Mão vale <b data-value>2</b></div>
        <div class="mode" data-mode></div>
      </div>
      <div class="team them"><span class="pts" data-them>0</span><span class="label">Eles</span></div>`;
    this.root.appendChild(board);
    this.scoreUs = board.querySelector('[data-us]')!;
    this.scoreThem = board.querySelector('[data-them]')!;
    this.valueEl = board.querySelector('[data-value]')!;
    this.modeEl = board.querySelector('[data-mode]')!;
    this.dots = [...board.querySelectorAll<HTMLElement>('.dots i')];

    // Etiquetas e balões
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      if (seat !== 0) {
        const tag = el('div', 'tag');
        this.root.appendChild(tag);
        this.tags.set(seat, tag);
        const pop = el('div', 'pop');
        this.root.appendChild(pop);
        this.pops.set(seat, pop);
      }
      const bubble = el('div', `bubble seat${seat}`);
      this.root.appendChild(bubble);
      this.bubbles.set(seat, bubble);
    }

    // Barra inferior
    const bar = el('div', 'bar');
    this.statusEl = el('div', 'status');
    this.coverBtn = el('button', 'btn ghost', 'Coberta');
    this.coverBtn.title = 'Jogar a próxima carta virada para baixo (a partir da 2ª rodada). Atalho: botão direito na carta.';
    this.coverBtn.onclick = () => this.h.onToggleCover();
    this.trucoBtn = el('button', 'btn truco', 'TRUCO!');
    this.trucoBtn.onclick = () => this.h.onTruco();
    this.muteBtn = el('button', 'btn icon', '🔊');
    this.muteBtn.title = 'Som';
    this.muteBtn.onclick = () => {
      const m = this.h.onToggleMute();
      this.muteBtn.textContent = m ? '🔇' : '🔊';
    };
    this.signalBtn = el('button', 'btn ghost', 'Sinais');
    this.signalBtn.title = 'Fazer um sinal secreto pro parceiro (teclas 1 a 6). Cuidado com quem está te olhando!';
    this.signalBtn.onclick = () => this.toggleWheel();
    const actions = el('div', 'actions');
    actions.append(this.signalBtn, this.coverBtn, this.trucoBtn);
    this.buildWheel();
    this.muteBtn.classList.add('mute');
    this.root.appendChild(this.muteBtn);
    bar.append(this.statusEl, actions);
    this.root.appendChild(bar);

    this.toastEl = el('div', 'toast');
    this.root.appendChild(this.toastEl);

    this.modal = el('div', 'modal hidden');
    this.root.appendChild(this.modal);

    window.addEventListener('keydown', (e) => {
      if (e.key === 't' || e.key === 'T') this.trucoBtn.click();
      if (e.key === 'c' || e.key === 'C') this.coverBtn.click();
      if (e.key === 'Escape') this.toggleWheel(false);
      const n = Number(e.key);
      if (n >= 1 && n <= 6 && !this.signalBtn.disabled) {
        this.toggleWheel(false);
        this.h.onSignal(SIGNAL_ORDER[n - 1]!);
      }
    });
  }

  private buildWheel() {
    this.wheel = el('div', 'wheel hidden');
    const ring = el('div', 'ring');
    SIGNAL_ORDER.forEach((id, i) => {
      const s = SIGNALS[id];
      const angle = (i / SIGNAL_ORDER.length) * Math.PI * 2 - Math.PI / 2;
      const b = el('button', 'sig', `<span class="e">${s.emoji}</span><span class="n">${s.label}</span><kbd>${i + 1}</kbd>`);
      b.style.setProperty('--x', `${Math.cos(angle) * 96}px`);
      b.style.setProperty('--y', `${Math.sin(angle) * 96}px`);
      b.title = `${s.label}: ${s.gesture}`;
      b.dataset.sig = id;
      b.onclick = () => {
        this.toggleWheel(false);
        this.h.onSignal(id);
      };
      ring.appendChild(b);
    });
    const hint = el('div', 'hint', 'Olho aceso = ele está te olhando.<br>Sinal visto por adversário é sinal entregado!');
    ring.appendChild(hint);
    this.wheel.appendChild(ring);
    this.wheel.onclick = (e) => {
      if (e.target === this.wheel) this.toggleWheel(false);
    };
    this.root.appendChild(this.wheel);
  }

  toggleWheel(open?: boolean) {
    const willOpen = open ?? this.wheel.classList.contains('hidden');
    this.wheel.classList.toggle('hidden', !willOpen || this.signalBtn.disabled);
  }

  setAnchor(fn: Anchor) {
    this.anchor = fn;
  }

  setNames(names: Record<Seat, string>, roles: Record<Seat, string>) {
    for (const [seat, tag] of this.tags) {
      // O olho só importa para adversários (o parceiro sempre recebe seus sinais).
      const eye = seat % 2 === 1 ? '<span class="eye" title="Aceso = está te olhando">👁</span>' : '';
      tag.innerHTML = `<span class="ia">IA</span> ${esc(names[seat])}<small>${esc(roles[seat])}</small>${eye}`;
    }
  }

  private positionAnchors() {
    if (!this.anchor) return;
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const a = this.anchor(seat);
      const tag = this.tags.get(seat);
      if (tag) {
        tag.style.transform = `translate(${a.x}px, ${a.y}px) translate(-50%, -100%)`;
        tag.style.opacity = a.visible ? '1' : '0';
      }
      const pop = this.pops.get(seat);
      if (pop) pop.style.transform = `translate(${a.x}px, ${a.y + 46}px) translate(-50%, -50%)`;
      const b = this.bubbles.get(seat)!;
      const y = seat === 0 ? a.y : a.y - 34;
      // Mantém o balão inteiro dentro da tela.
      const half = b.offsetWidth / 2;
      const vw = this.root.clientWidth;
      const x = Math.min(vw - half - 8, Math.max(half + 8, a.x));
      b.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
  }

  render(view: PlayerView, s: HudState) {
    const us = view.team;
    const them = (1 - us) as Team;
    this.setScores(view.scores[us], view.scores[them]);
    // Com aposta pendente, mostra o valor já garantido (quem aumenta aceitou o degrau anterior) → valor proposto.
    const ladder = view.config.betLadder;
    const secured = view.pendingBet ? (ladder[ladder.indexOf(view.pendingBet.value) - 1] ?? view.value) : view.value;
    this.valueEl.textContent = view.pendingBet ? `${secured} → ${view.pendingBet.value}` : String(view.value);
    this.modeEl.textContent =
      view.mode === 'mao_de_10'
        ? view.maoDe10Team === us
          ? 'Mão de 10 (nós)'
          : 'Mão de 10 (eles)'
        : view.mode === 'mao_de_ferro'
          ? 'Mão de Ferro'
          : `Mão ${view.handNumber}`;
    view.rounds.forEach((r, i) => this.setRoundDot(i, r.winner, us));
    for (let i = view.rounds.length; i < 3; i++) this.setRoundDot(i, null, us);

    for (const [seat, tag] of this.tags) tag.classList.toggle('turn', view.phase === 'playing' && view.turn === seat);

    this.trucoBtn.textContent = s.trucoLabel;
    this.trucoBtn.disabled = !s.canTruco;
    this.trucoBtn.classList.toggle('pulse', s.canTruco);
    this.coverBtn.disabled = !s.canCover;
    this.coverBtn.classList.toggle('on', s.coverOn && s.canCover);
    this.signalBtn.disabled = !s.canSignal;
    if (!s.canSignal) this.toggleWheel(false);
    this.statusEl.textContent = s.status;
    this.statusEl.classList.toggle('mine', s.myTurn);
  }

  setScores(us: number, them: number) {
    const bump = (e: HTMLElement, v: number) => {
      const txt = String(Math.min(v, 99));
      if (e.textContent !== txt) {
        e.textContent = txt;
        e.classList.remove('bump');
        void e.offsetWidth;
        e.classList.add('bump');
      }
    };
    bump(this.scoreUs, us);
    bump(this.scoreThem, them);
  }

  /** Liga o "olho" na plaquinha do adversário que está te olhando. */
  setWatching(seat: Seat, watching: boolean) {
    this.tags.get(seat)?.classList.toggle('watching', watching);
  }

  /** Emoji rápido perto do rosto de um bot (ajuda a perceber o sinal em telas pequenas). */
  pop(seat: Seat, emoji: string) {
    const p = this.pops.get(seat);
    if (!p) return;
    p.textContent = emoji;
    p.classList.remove('show');
    void p.offsetWidth;
    p.classList.add('show');
  }

  setRoundDot(i: number, winner: RoundWinner | null, us: Team) {
    const d = this.dots[i];
    if (!d) return;
    d.className = winner === null ? '' : winner === 'tie' ? 'tie' : winner === us ? 'win' : 'lose';
  }

  say(seat: Seat, text: string, loud = false, ms = 2200) {
    const b = this.bubbles.get(seat)!;
    b.textContent = text;
    b.classList.toggle('loud', loud);
    b.classList.add('show');
    clearTimeout(this.bubbleTimers.get(seat));
    this.bubbleTimers.set(
      seat,
      window.setTimeout(() => b.classList.remove('show'), ms),
    );
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info', ms = 1800) {
    this.toastEl.textContent = text;
    this.toastEl.className = `toast show ${kind}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.className = 'toast'), ms);
  }

  /** Abre um painel genérico (usado pelo menu online). */
  panel(html: string, cls = '') {
    return this.openModal(html, cls);
  }

  /** Nova mão (online): limpa as bolinhas e mostra o valor inicial. */
  resetHand(value: number) {
    for (let i = 0; i < 3; i++) this.dots[i]!.className = '';
    this.valueEl.textContent = String(value);
  }

  setValueText(text: string) {
    this.valueEl.textContent = text;
  }

  private openModal(html: string, cls = '') {
    this.modal.className = `modal ${cls}`;
    this.modal.innerHTML = `<div class="panel">${html}</div>`;
    return this.modal.querySelector('.panel') as HTMLElement;
  }

  hideModal() {
    this.modal.className = 'modal hidden';
    this.modal.innerHTML = '';
  }

  showBet(opts: { from: string; label: string; value: number; previous: number; raiseLabel: string | null }) {
    const p = this.openModal(
      `<h2>${esc(opts.from)} pediu <span class="hot">${esc(opts.label)}</span></h2>
       <p>Aceitar: a mão passa a valer <b>${opts.value}</b>. Correr: eles levam <b>${opts.previous}</b>.</p>
       <div class="row">
         <button class="btn" data-a="accept">Desce! (aceitar)</button>
         <button class="btn ghost" data-a="run">Correr</button>
         ${opts.raiseLabel ? `<button class="btn truco" data-a="raise">${esc(opts.raiseLabel)}</button>` : ''}
       </div>`,
      'bet',
    );
    p.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => {
        this.hideModal();
        this.h.onRespond(b.dataset.a as 'accept' | 'run' | 'raise');
      };
    });
  }

  showMao10(mine: Card[], partner: Card[], partnerName: string, playValue: number, runValue: number) {
    const imgs = (cards: Card[]) => cards.map((c) => `<img src="${cardImageURL(c)}" alt="${c.rank} de ${c.suit}">`).join('');
    const p = this.openModal(
      `<h2>Mão de 10!</h2>
       <p class="quote">"Passa as carta aí, parceiro, vamo ver se nóis tem jogo."</p>
       <div class="hands">
         <div><h3>Suas cartas</h3><div class="cards">${imgs(mine)}</div></div>
         <div><h3>${esc(partnerName)}</h3><div class="cards">${imgs(partner)}</div></div>
       </div>
       <p>Jogar: a mão vale <b>${playValue}</b> e <b>ninguém pode pedir truco</b>. Correr: eles levam <b>${runValue}</b>.</p>
       <div class="row">
         <button class="btn" data-p="1">Jogar</button>
         <button class="btn ghost" data-p="0">Correr</button>
       </div>`,
      'mao10',
    );
    p.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => {
        this.hideModal();
        this.h.onMao10(b.dataset.p === '1');
      };
    });
  }

  showStart(online = false) {
    const p = this.openModal(
      `<h1>Zap <span>&</span> Copeta</h1>
       <p class="sub">Truco Mineiro · Manilha Velha</p>
       <ul class="rules">
         <li>Você + <b>Chico Mineiro</b> (IA) contra 2 IAs. Quem fizer <b>12 tentos</b> leva a queda.</li>
         <li>Manilhas: <b>Zap</b> 4♣ › <b>Copeta</b> 7♥ › <b>Espadilha</b> A♠ › <b>Pica-fumo</b> 7♦.</li>
         <li>Depois: 3 › 2 › A › K › J › Q › 7 › 6 › 5 › 4.</li>
         <li>Mão vale 2. Truco 4 · Seis 6 · Dez 10 · Doze 12.</li>
         <li>Clique na carta pra jogar. Botão direito (ou <b>Coberta</b>) joga virada, a partir da 2ª rodada.</li>
         <li><b>Sinais</b> (teclas 1–6): 😉 Zap · 😗 Copeta · 😛 Espadilha · 🤷 Pica-fumo · ✋ Três · 😑 Cego. Se um adversário estiver te olhando (👁 aceso), ele pega o sinal!</li>
       </ul>
       <div class="row">
         <button class="btn truco big" data-go>Bora jogar!</button>
         ${online ? '<button class="btn big" data-online>Jogar online</button>' : ''}
       </div>
       ${online ? '<p class="hint-small">Online: entre com seu e-mail, jogue pelo servidor e veja seu histórico. Offline não precisa de cadastro.</p>' : ''}`,
      'start',
    );
    p.querySelector<HTMLButtonElement>('[data-go]')!.onclick = () => {
      this.hideModal();
      this.h.onStart();
    };
    const on = p.querySelector<HTMLButtonElement>('[data-online]');
    if (on) on.onclick = () => this.h.onOnline();
  }

  showEnd(win: boolean, us: number, them: number, capote: boolean) {
    const p = this.openModal(
      `<h1>${win ? 'Ganhamos a queda!' : 'Perdemos a queda...'}</h1>
       ${capote ? `<p class="capote">${win ? 'CAPOTE! 12 a 0!' : 'Levamos capote...'}</p>` : ''}
       <p class="final">Nós <b>${us}</b> × <b>${them}</b> Eles</p>
       <div class="row">
         <button class="btn truco big" data-again>Jogar de novo</button>
         <button class="btn ghost" data-menu>Menu</button>
       </div>`,
      `end ${win ? 'win' : 'lose'}`,
    );
    p.querySelector<HTMLButtonElement>('[data-again]')!.onclick = () => {
      this.hideModal();
      this.h.onRestart();
    };
    p.querySelector<HTMLButtonElement>('[data-menu]')!.onclick = () => this.h.onMenu();
  }
}
