// Telas do modo online: login (link + código), apelido, lobby com estatísticas e histórico.
import type { Hud } from '../hud/hud.ts';
import type { Controller } from '../game/controller.ts';
import { ApiError, OnlineApi, type Me } from './api.ts';
import { DEV_AUTH } from './config.ts';
import { getSession, type Session } from './session.ts';

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class OnlineMenu {
  private session: Session | null = null;
  private api: OnlineApi | null = null;
  /** Tela atual, para reagir quando o login acontece pelo link (em outra aba ou no retorno). */
  private screen: 'none' | 'login' | 'code' | 'lobby' | 'other' = 'none';

  constructor(
    private hud: Hud,
    private controller: Controller,
    private onBack: () => void,
  ) {
    controller.onOnlineFatal = (message) => {
      this.hud.toast(message, 'bad', 2600);
      void this.open();
    };
  }

  /** Prepara a sessão e, se a pessoa voltou do link do e-mail, já abre o lobby. */
  async init() {
    try {
      this.session = await getSession();
    } catch (err) {
      console.warn('Sessão online indisponível', err);
      return;
    }
    this.api = new OnlineApi(this.session);
    this.session.onChange(() => {
      if ((this.screen === 'login' || this.screen === 'code') && this.session?.email) void this.showLobby();
    });
    if (location.search.includes('code=') || location.hash.includes('access_token')) {
      // Voltou do link mágico: espera a troca do código pela sessão e abre o lobby.
      window.setTimeout(() => void this.open(), 400);
    }
  }

  async open() {
    if (!this.session || !this.api) await this.init();
    if (!this.session || !this.api) {
      this.hud.toast('Modo online indisponível agora.', 'bad');
      return;
    }
    const token = await this.session.token();
    if (!token) this.showLogin();
    else await this.showLobby();
  }

  private loading(text = 'Carregando…') {
    this.screen = 'other';
    this.hud.panel(`<h2>${esc(text)}</h2>`, 'online');
  }

  private showLogin(prefill = '', error = '') {
    this.screen = 'login';
    const p = this.hud.panel(
      `<h2>Jogar online</h2>
       <p>${DEV_AUTH ? 'Modo de desenvolvimento: entra direto, sem enviar e-mail.' : 'Entre com seu e-mail. Enviamos um <b>link</b> e um <b>código de 6 dígitos</b> — use o que for mais fácil.'}</p>
       <form class="form" data-form novalidate>
         <label for="email">E-mail</label>
         <input id="email" type="email" inputmode="email" autocomplete="email" required value="${esc(prefill)}" placeholder="voce@exemplo.com">
         <div class="err" data-err>${esc(error)}</div>
         <div class="row">
           <button class="btn truco" type="submit" data-send>${DEV_AUTH ? 'Entrar' : 'Enviar'}</button>
           <button class="btn ghost" type="button" data-back>Voltar</button>
         </div>
       </form>`,
      'online',
    );
    const input = p.querySelector<HTMLInputElement>('#email')!;
    const err = p.querySelector<HTMLElement>('[data-err]')!;
    const send = p.querySelector<HTMLButtonElement>('[data-send]')!;
    p.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => this.back();
    p.querySelector<HTMLFormElement>('[data-form]')!.onsubmit = async (ev) => {
      ev.preventDefault();
      const email = input.value.trim();
      if (!EMAIL_RE.test(email)) {
        err.textContent = 'Digite um e-mail válido.';
        return;
      }
      send.disabled = true;
      err.textContent = '';
      const r = await this.session!.sendLink(email);
      send.disabled = false;
      if (!r.ok) {
        err.textContent = r.error;
        return;
      }
      if (r.instant) await this.showLobby();
      else this.showCode(email);
    };
    window.setTimeout(() => input.focus(), 50);
  }

  private showCode(email: string, error = '') {
    this.screen = 'code';
    const p = this.hud.panel(
      `<h2>Confira seu e-mail</h2>
       <p>Enviamos para <b>${esc(email)}</b>. Clique no link do e-mail <b>ou</b> digite o código aqui:</p>
       <form class="form" data-form novalidate>
         <input class="code" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="000000">
         <div class="err" data-err>${esc(error)}</div>
         <div class="row">
           <button class="btn truco" type="submit" data-ok>Entrar</button>
           <button class="btn ghost" type="button" data-again>Reenviar</button>
           <button class="btn ghost" type="button" data-back>Voltar</button>
         </div>
       </form>
       <p class="hint-small">Não chegou? Veja a caixa de spam. O código vale por pouco tempo.</p>`,
      'online',
    );
    const input = p.querySelector<HTMLInputElement>('#code')!;
    const err = p.querySelector<HTMLElement>('[data-err]')!;
    const ok = p.querySelector<HTMLButtonElement>('[data-ok]')!;
    p.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => this.showLogin(email);
    p.querySelector<HTMLButtonElement>('[data-again]')!.onclick = async () => {
      const r = await this.session!.sendLink(email);
      err.textContent = r.ok ? 'Enviamos de novo.' : r.error;
    };
    p.querySelector<HTMLFormElement>('[data-form]')!.onsubmit = async (ev) => {
      ev.preventDefault();
      const code = input.value.replace(/\D/g, '');
      if (code.length !== 6) {
        err.textContent = 'O código tem 6 números.';
        return;
      }
      ok.disabled = true;
      const r = await this.session!.verifyCode(email, code);
      ok.disabled = false;
      if (!r.ok) {
        err.textContent = r.error;
        return;
      }
      await this.showLobby();
    };
    window.setTimeout(() => input.focus(), 50);
  }

  private async fetchMe(): Promise<Me | null> {
    try {
      return await this.api!.me();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await this.session!.signOut();
        this.showLogin('', 'Sua sessão expirou. Entre de novo.');
        return null;
      }
      const msg = e instanceof ApiError && e.code === 'online_disabled' ? 'O modo online ainda não está configurado no servidor.' : (e as Error).message;
      this.hud.panel(
        `<h2>Ops</h2><p>${esc(msg)}</p><div class="row"><button class="btn ghost" data-back>Voltar</button></div>`,
        'online',
      ).querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => this.back();
      return null;
    }
  }

  private async showLobby() {
    this.loading();
    const me = await this.fetchMe();
    if (!me) return;
    if (!me.profile) {
      this.showNickname();
      return;
    }
    this.screen = 'lobby';
    const s = me.stats;
    const rate = s.matchesPlayed ? Math.round((100 * s.wins) / s.matchesPlayed) : 0;
    const p = this.hud.panel(
      `<h2>Olá, ${esc(me.profile.nickname)}!</h2>
       <div class="stats">
         <div><b>${s.matchesPlayed}</b><span>partidas</span></div>
         <div><b>${s.wins}</b><span>vitórias (${rate}%)</span></div>
         <div><b>${s.capotes}</b><span>capotes</span></div>
       </div>
       <p class="hint-small">Melhor sequência: ${s.bestStreak} · Sequência atual: ${s.winStreak}</p>
       <div class="row">
         <button class="btn truco big" data-play>Jogar pelo servidor</button>
         ${me.activeMatchId ? '<button class="btn" data-resume>Continuar partida</button>' : ''}
       </div>
       <p class="hint-small">Por enquanto: você + Chico contra 2 bots, com as cartas embaralhadas e validadas no servidor. Salas com amigos vêm na próxima etapa.</p>
       <div class="row">
         <button class="btn ghost" data-history>Histórico</button>
         <button class="btn ghost" data-nick>Trocar apelido</button>
         <button class="btn ghost" data-logout>Sair</button>
         <button class="btn ghost" data-back>Voltar</button>
       </div>`,
      'online',
    );
    p.querySelector<HTMLButtonElement>('[data-play]')!.onclick = () => this.play();
    p.querySelector<HTMLButtonElement>('[data-resume]')?.addEventListener('click', () => this.play(me.activeMatchId!));
    p.querySelector<HTMLButtonElement>('[data-history]')!.onclick = () => void this.showHistory();
    p.querySelector<HTMLButtonElement>('[data-nick]')!.onclick = () => this.showNickname(me.profile!.nickname);
    p.querySelector<HTMLButtonElement>('[data-logout]')!.onclick = async () => {
      await this.session!.signOut();
      this.back();
    };
    p.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => this.back();
  }

  private play(resumeId?: string) {
    this.screen = 'none';
    this.hud.hideModal();
    void this.controller.startOnline(this.api!, resumeId);
  }

  private showNickname(current = '', error = '') {
    this.screen = 'other';
    const p = this.hud.panel(
      `<h2>Como te chamam na mesa?</h2>
       <form class="form" data-form novalidate>
         <label for="nick">Apelido (2 a 20 caracteres)</label>
         <input id="nick" maxlength="20" autocomplete="nickname" value="${esc(current)}" placeholder="Ex.: Tião do Zap">
         <div class="err" data-err>${esc(error)}</div>
         <div class="row">
           <button class="btn truco" type="submit" data-save>Salvar</button>
           <button class="btn ghost" type="button" data-back>Voltar</button>
         </div>
       </form>`,
      'online',
    );
    const input = p.querySelector<HTMLInputElement>('#nick')!;
    const err = p.querySelector<HTMLElement>('[data-err]')!;
    p.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => (current ? void this.showLobby() : this.back());
    p.querySelector<HTMLFormElement>('[data-form]')!.onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        await this.api!.setNickname(input.value);
        await this.showLobby();
      } catch (e) {
        err.textContent = e instanceof ApiError ? e.message : 'Não deu certo. Tente de novo.';
      }
    };
    window.setTimeout(() => input.focus(), 50);
  }

  private async showHistory() {
    this.loading();
    let items;
    try {
      items = (await this.api!.history(20)).items;
    } catch (e) {
      this.hud.toast((e as Error).message, 'bad');
      await this.showLobby();
      return;
    }
    this.screen = 'other';
    const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const list = items.length
      ? items
          .map(
            (h) => `<li>
              <span><span class="res ${h.won ? 'win' : 'lose'}">${h.won ? 'Vitória' : 'Derrota'}</span> ${h.scoreUs} × ${h.scoreThem}${h.capote ? ' · capote' : ''}<br>
              <small>com ${esc(h.partner ?? '?')} contra ${h.opponents.map(esc).join(' e ')}</small></span>
              <small>${fmt.format(new Date(h.finishedAt))}</small>
            </li>`,
          )
          .join('')
      : '<li>Nenhuma partida online terminada ainda.</li>';
    const p = this.hud.panel(
      `<h2>Histórico</h2><ul class="history">${list}</ul>
       <div class="row"><button class="btn ghost" data-back>Voltar</button></div>`,
      'online',
    );
    p.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => void this.showLobby();
  }

  private back() {
    this.screen = 'none';
    this.onBack();
  }
}
