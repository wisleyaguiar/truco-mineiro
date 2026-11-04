// Falas típicas (PRD 5.3). No MVP aparecem como balões de texto; Fase 2 troca por áudio gravado.
import type { BetName } from '@truco/engine';

const LINES = {
  truco: ['Truco, ladrão!', 'Truco, marreco! Desce ou corre!', 'TRUCO! Quero ver ocê aguentar!', 'Truco nessa budega!'],
  seis: ['Ladrão que rouba ladrão... SEIS, papai!', 'SEIS! Cê achou que ia ser fácil?', 'Seis procê, sô!'],
  dez: ['Meio quilo! Chora na cama que é lugar quente!', 'DEZ! Agora o trem ficou sério!', 'Dez, uai! Vai encarar?'],
  doze: ['DOZE! Aqui tem coragem, uai!', 'DOZE! Vale a queda, sô!', 'Doze! Ou vai ou racha!'],
  accept: ['Desce!', 'Manda descer!', 'Pode vir, sô!', 'Tô dentro!'],
  run: ['Vou deixar procêis dessa vez...', 'Corro, corro...', 'Essa eu passo, uai.'],
  run_reply: ['Matou cachorro a grito, hein?', 'Correu, frouxo!', 'Tá com medo, é?'],
  zap: ['Toma esse Gato na testa!', 'Aqui o sistema é bruto!', 'Zap neles!'],
  canga: ['Cangou! Mostra a maior!', 'Amarrou o jogo!', 'Cangou, sô!'],
  mao10: ['Passa as carta aí, parceiro, vamo ver se nóis tem jogo.', 'Mão de dez! Deixa eu ver isso aí...'],
  mao10_play: ['Bora jogar! Nóis tem jogo!', 'Vamo pra cima!'],
  mao10_run: ['Essa não dá não... corremo.', 'Melhor correr dessa.'],
  win_round: ['Essa é nossa!', 'Levei!', 'Pode recolher!'],
  ferro: ['Mão de ferro! Todo mundo no escuro!', 'Agora é na sorte, uai!'],
} as const;

export type LineKind = keyof typeof LINES;

export function line(kind: LineKind): string {
  const list = LINES[kind];
  return list[Math.floor(Math.random() * list.length)]!;
}

export function betLine(name: BetName): string {
  return line(name);
}
