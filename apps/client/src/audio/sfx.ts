// Efeitos sonoros sintetizados com WebAudio (sem arquivos de áudio no MVP).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function initAudio() {
  if (ctx) {
    void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.7;
}

export function isMuted() {
  return muted;
}

function noiseBuffer(seconds: number): AudioBuffer | null {
  if (!ctx) return null;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function burst(opts: { dur: number; type: BiquadFilterType; freq: number; q?: number; gain: number; delay?: number; decay?: number }) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + (opts.delay ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(opts.dur);
  const filter = ctx.createBiquadFilter();
  filter.type = opts.type;
  filter.frequency.value = opts.freq;
  filter.Q.value = opts.q ?? 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(opts.gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (opts.decay ?? opts.dur));
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + opts.dur + 0.05);
}

function thump(freq: number, gain: number, dur: number, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 1.6, t);
  osc.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Estalo seco da carta batendo na madeira/feltro. */
export function cardSnap(strong = false) {
  burst({ dur: 0.05, type: 'bandpass', freq: strong ? 1800 : 2600, q: 1.2, gain: strong ? 0.9 : 0.5 });
  if (strong) thump(120, 0.5, 0.12);
}

/** Carta deslizando (distribuição). */
export function cardSlide() {
  burst({ dur: 0.08, type: 'highpass', freq: 3500, gain: 0.18, decay: 0.07 });
}

/** Tapa na mesa (grito de truco). Intensidade 1..3. */
export function tableSlap(intensity = 1) {
  const k = Math.min(3, Math.max(1, intensity));
  burst({ dur: 0.18, type: 'lowpass', freq: 900 + k * 250, gain: 0.6 + k * 0.2, decay: 0.16 });
  thump(70, 0.6 + k * 0.25, 0.25);
  if (k >= 2) thump(55, 0.5, 0.3, 0.02);
}

/** Tentos (feijões/palitos) sendo arrastados no placar. */
export function tentos(n = 2) {
  for (let i = 0; i < Math.min(6, n); i++) {
    burst({ dur: 0.03, type: 'bandpass', freq: 3200 + Math.random() * 1200, q: 4, gain: 0.35, delay: i * 0.07 });
  }
}

/** Vitória / derrota da partida (acorde curto). */
export function jingle(win: boolean) {
  if (!ctx || !master) return;
  const notes = win ? [392, 494, 587, 784] : [392, 349, 311, 262];
  notes.forEach((f, i) => {
    const t = ctx!.currentTime + i * 0.14;
    const osc = ctx!.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g).connect(master!);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}
