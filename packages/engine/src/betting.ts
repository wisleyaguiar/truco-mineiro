import type { BetName } from './types.ts';

const NAMES: BetName[] = ['truco', 'seis', 'dez', 'doze'];

/** Próximo valor da escada de apostas, ou null se já está no teto. */
export function nextBetValue(value: number, ladder: readonly number[]): number | null {
  const idx = ladder.indexOf(value);
  if (idx < 0 || idx + 1 >= ladder.length) return null;
  return ladder[idx + 1]!;
}

/** Nome do grito que leva a mão a `value` (4 → truco, 6 → seis, 10 → dez, 12 → doze). */
export function betName(value: number, ladder: readonly number[]): BetName {
  const idx = ladder.indexOf(value);
  if (idx < 1) throw new Error(`Valor de aposta inválido: ${value}`);
  return NAMES[Math.min(idx - 1, NAMES.length - 1)]!;
}

/** Rótulo para botão/fala: "TRUCO!", "SEIS!", "DEZ!", "DOZE!". */
export function betLabel(name: BetName): string {
  return `${name.toUpperCase()}!`;
}
