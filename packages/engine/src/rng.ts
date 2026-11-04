// RNG determinístico (mulberry32) para embaralhar de forma reproduzível.

export function nextRandom(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) >>> 0;
  const newState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: newState };
}

/** Fisher–Yates com RNG determinístico. Retorna o array embaralhado e o novo estado. */
export function shuffle<T>(items: readonly T[], state: number): { items: T[]; state: number } {
  const arr = items.slice();
  let s = state;
  for (let i = arr.length - 1; i > 0; i--) {
    const r = nextRandom(s);
    s = r.state;
    const j = Math.floor(r.value * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return { items: arr, state: s };
}

/** Gerador simples para quem precisa de um Math.random reproduzível (bots, testes). */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    const r = nextRandom(s);
    s = r.state;
    return r.value;
  };
}
