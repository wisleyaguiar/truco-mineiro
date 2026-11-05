import './style.css';
import type { Seat } from '@truco/engine';
import { PERSONALITIES } from '@truco/bots';
import * as sfx from './audio/sfx.ts';
import { Controller, PLAYERS } from './game/controller.ts';
import { Hud } from './hud/hud.ts';
import { ONLINE_ENABLED } from './online/config.ts';
import { OnlineMenu } from './online/menu.ts';
import { Stage } from './scene/stage.ts';

const app = document.getElementById('app')!;
let controller: Controller;
let menu: OnlineMenu | null = null;

const stage = new Stage(app, {
  onCardClick: (i, right) => controller.onCardClick(i, right),
});

const hud = new Hud(app, {
  onStart: () => {
    sfx.initAudio();
    void controller.start();
  },
  onRestart: () => {
    void stage.clearTable(3).then(() => controller.restart());
  },
  onOnline: () => {
    sfx.initAudio();
    void menu?.open();
  },
  onMenu: () => hud.showStart(ONLINE_ENABLED),
  onTruco: () => controller.onTruco(),
  onToggleCover: () => controller.onToggleCover(),
  onRespond: (r) => controller.onRespond(r),
  onMao10: (p) => controller.onMao10(p),
  onSignal: (s) => controller.onSignal(s),
  onToggleMute: () => {
    sfx.setMuted(!sfx.isMuted());
    return sfx.isMuted();
  },
});

hud.setAnchor((seat) => stage.screenAnchor(seat));
const names = {} as Record<Seat, string>;
const roles = {} as Record<Seat, string>;
for (const seat of [0, 1, 2, 3] as Seat[]) {
  names[seat] = PLAYERS[seat].name;
  const p = PLAYERS[seat].personality;
  roles[seat] = seat === 2 ? 'parceiro' : p ? PERSONALITIES[p].label : '';
}
// Nomes dos bots já trazem a personalidade; mostramos o papel na mesa.
roles[1] = 'adversário';
roles[3] = 'adversário';
hud.setNames(names, roles);

controller = new Controller(stage, hud);
hud.showStart(ONLINE_ENABLED);
if (ONLINE_ENABLED) {
  menu = new OnlineMenu(hud, controller, () => hud.showStart(ONLINE_ENABLED));
  void menu.init();
}

// Gancho para testes automatizados (Playwright) e depuração.
declare global {
  interface Window {
    __truco: { controller: Controller; stage: Stage; menu: OnlineMenu | null };
  }
}
window.__truco = { controller, stage, menu };
