// Arte das cartas desenhada em <canvas> (sem assets de terceiros).
import * as THREE from 'three';
import { MANILHA_NAMES, type Card, type Suit } from '@truco/engine';

export const CARD_W = 256;
export const CARD_H = 360;

const RED = '#b3261e';
const BLACK = '#1b1b1b';
const GOLD = '#c9a24a';

export function suitColor(suit: Suit): string {
  return suit === 'copas' || suit === 'ouros' ? RED : BLACK;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Desenha o símbolo do naipe centralizado em (cx, cy) com altura ~size. */
export function drawSuit(ctx: CanvasRenderingContext2D, suit: Suit, cx: number, cy: number, size: number) {
  const s = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = suitColor(suit);
  ctx.beginPath();
  switch (suit) {
    case 'ouros':
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.72, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.72, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case 'copas':
      ctx.moveTo(0, s * 0.95);
      ctx.bezierCurveTo(-s * 1.25, s * 0.05, -s * 0.75, -s * 1.05, 0, -s * 0.42);
      ctx.bezierCurveTo(s * 0.75, -s * 1.05, s * 1.25, s * 0.05, 0, s * 0.95);
      ctx.fill();
      break;
    case 'espadas':
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 1.25, -s * 0.15, s * 0.7, s * 0.85, 0, s * 0.32);
      ctx.bezierCurveTo(-s * 0.7, s * 0.85, -s * 1.25, -s * 0.15, 0, -s);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, s * 0.2);
      ctx.lineTo(s * 0.32, s);
      ctx.lineTo(-s * 0.32, s);
      ctx.closePath();
      ctx.fill();
      break;
    case 'paus': {
      const r = s * 0.42;
      ctx.arc(0, -s * 0.48, r, 0, Math.PI * 2);
      ctx.moveTo(-s * 0.45 + r, s * 0.08);
      ctx.arc(-s * 0.45, s * 0.08, r, 0, Math.PI * 2);
      ctx.moveTo(s * 0.45 + r, s * 0.08);
      ctx.arc(s * 0.45, s * 0.08, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.1);
      ctx.lineTo(s * 0.3, s);
      ctx.lineTo(-s * 0.3, s);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawFace(ctx: CanvasRenderingContext2D, card: Card) {
  const manilha = MANILHA_NAMES[card.id];
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  roundRect(ctx, 2, 2, CARD_W - 4, CARD_H - 4, 18);
  ctx.fillStyle = '#f8f2e4';
  ctx.fill();
  ctx.lineWidth = manilha ? 8 : 3;
  ctx.strokeStyle = manilha ? GOLD : '#cfc6b2';
  ctx.stroke();

  const color = suitColor(card.suit);
  ctx.fillStyle = color;
  ctx.font = 'bold 64px Georgia, "DejaVu Serif", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // canto superior esquerdo
  ctx.fillText(card.rank, 40, 46);
  drawSuit(ctx, card.suit, 40, 100, 38);
  // canto inferior direito (invertido)
  ctx.save();
  ctx.translate(CARD_W - 40, CARD_H - 46);
  ctx.rotate(Math.PI);
  ctx.fillText(card.rank, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(CARD_W - 40, CARD_H - 100);
  ctx.rotate(Math.PI);
  drawSuit(ctx, card.suit, 0, 0, 38);
  ctx.restore();

  // naipe central
  drawSuit(ctx, card.suit, CARD_W / 2, CARD_H / 2 - (manilha ? 14 : 0), manilha ? 120 : 140);

  if (manilha) {
    ctx.fillStyle = GOLD;
    roundRect(ctx, 46, CARD_H - 112, CARD_W - 92, 40, 10);
    ctx.fill();
    ctx.fillStyle = '#2a1d05';
    ctx.font = 'bold 26px Georgia, "DejaVu Serif", serif';
    ctx.fillText(manilha.toUpperCase(), CARD_W / 2, CARD_H - 91);
  }
}

function drawBack(ctx: CanvasRenderingContext2D) {
  roundRect(ctx, 2, 2, CARD_W - 4, CARD_H - 4, 18);
  ctx.fillStyle = '#f3ead6';
  ctx.fill();
  roundRect(ctx, 14, 14, CARD_W - 28, CARD_H - 28, 12);
  ctx.fillStyle = '#7a1f1f';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255, 215, 140, 0.35)';
  ctx.lineWidth = 3;
  for (let i = -CARD_H; i < CARD_W + CARD_H; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i - CARD_H, CARD_H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i - CARD_H, 0);
    ctx.lineTo(i, CARD_H);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 5;
  roundRect(ctx, 24, 24, CARD_W - 48, CARD_H - 48, 10);
  ctx.stroke();
  ctx.fillStyle = '#7a1f1f';
  ctx.beginPath();
  ctx.arc(CARD_W / 2, CARD_H / 2, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 40px Georgia, "DejaVu Serif", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Z&C', CARD_W / 2, CARD_H / 2 + 2);
}

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  return [canvas, canvas.getContext('2d')!];
}

const faceCache = new Map<string, THREE.CanvasTexture>();
const urlCache = new Map<string, string>();
let backTexture: THREE.CanvasTexture | null = null;

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function faceTexture(card: Card): THREE.CanvasTexture {
  let tex = faceCache.get(card.id);
  if (!tex) {
    const [canvas, ctx] = makeCanvas();
    drawFace(ctx, card);
    tex = toTexture(canvas);
    faceCache.set(card.id, tex);
  }
  return tex;
}

export function backTex(): THREE.CanvasTexture {
  if (!backTexture) {
    const [canvas, ctx] = makeCanvas();
    drawBack(ctx);
    backTexture = toTexture(canvas);
  }
  return backTexture;
}

/** Imagem PNG da carta (para o HUD, ex.: tela da Mão de 10). null = verso. */
export function cardImageURL(card: Card | null): string {
  const key = card?.id ?? '__back';
  let url = urlCache.get(key);
  if (!url) {
    const [canvas, ctx] = makeCanvas();
    if (card) drawFace(ctx, card);
    else drawBack(ctx);
    url = canvas.toDataURL('image/png');
    urlCache.set(key, url);
  }
  return url;
}
