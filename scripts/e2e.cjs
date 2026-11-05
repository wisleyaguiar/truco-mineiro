// Teste ponta a ponta: abre o jogo no Chromium, joga uma partida inteira e tira screenshots.
// Uso: node scripts/e2e.cjs [url] [pastaDeSaida]
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = process.argv[2] || 'http://localhost:5173/';
const OUT = process.argv[3] || path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHumanTurnOrModal(page, timeout = 30000) {
  return page.waitForFunction(
    () => {
      const c = window.__truco?.controller;
      if (!c?.state) return false;
      const modal = document.querySelector('.modal:not(.hidden)');
      if (modal) return 'modal';
      const st = c.state;
      if (st.phase === 'match_over') return 'over';
      if (st.phase === 'playing' && st.hand.turn === 0 && !c.busy) return 'turn';
      return false;
    },
    null,
    { timeout, polling: 100 },
  );
}


/** Testa a roda de sinais, o recebimento pelo parceiro e a interceptação. */
async function testSignals(page, label, shots) {
  // Conta sinais dos bots (via pop de emoji no HUD)
  await page.evaluate(() => {
    if (window.__popHooked) return;
    window.__popHooked = true;
    window.__botSignalCount = 0;
    const obs = new MutationObserver((muts) => muts.forEach((m) => m.target.classList?.contains('show') && window.__botSignalCount++));
    document.querySelectorAll('.pop').forEach((p) => obs.observe(p, { attributes: true, attributeFilter: ['class'] }));
  });
  // 1) Ninguém olhando: abre a roda, manda Zap. Parceiro (2) deve saber; adversários não.
  await page.evaluate(() => {
    const s = window.__truco.controller.signals;
    s.pinGaze(1, null);
    s.pinGaze(3, null);
  });
  await page.click('.bar button:has-text("Sinais")');
  await sleep(400);
  if (shots) await page.screenshot({ path: path.join(OUT, `${label}-8-roda-sinais.png`) });
  await page.click('.wheel .sig[data-sig="zap"]');
  await sleep(300);
  const k1 = await page.evaluate(() => {
    const s = window.__truco.controller.signals;
    return { parceiro: s.knowledgeFor(2)[0] ?? null, adv1: s.knowledgeFor(1)[0] ?? null, adv3: s.knowledgeFor(3)[0] ?? null };
  });
  // 2) Zé (1) olhando pra você: manda Copeta (tecla 2) depois do intervalo. Zé deve interceptar.
  await page.evaluate(() => window.__truco.controller.signals.pinGaze(1, 0));
  await sleep(500);
  const eyeOn = await page.$$eval('.tag.watching', (els) => els.length);
  await sleep(1700);
  await page.keyboard.press('2');
  await sleep(300);
  const toast = await page.$eval('.toast', (e) => e.textContent);
  if (shots) await page.screenshot({ path: path.join(OUT, `${label}-9-sinal-interceptado.png`) });
  const k2 = await page.evaluate(() => {
    const s = window.__truco.controller.signals;
    return { parceiro: s.knowledgeFor(2)[0] ?? null, adv1: s.knowledgeFor(1)[0] ?? null, adv3: s.knowledgeFor(3)[0] ?? null };
  });
  await page.evaluate(() => {
    const s = window.__truco.controller.signals;
    s.pinGaze(1, undefined);
    s.pinGaze(3, undefined);
  });
  const ok =
    JSON.stringify(k1.parceiro) === '["zap"]' && k1.adv1 === null && k1.adv3 === null &&
    eyeOn >= 1 && /pegou/.test(toast) &&
    JSON.stringify(k2.adv1) === '["copeta"]' && k2.adv3 === null && (k2.parceiro || []).includes('copeta');
  if (!ok) console.log('FALHA SINAIS', JSON.stringify({ k1, k2, eyeOn, toast }));
  return { ok, k1, k2, eyeOn, toast };
}

async function playMatch(page, label, { shots = true, maxSteps = 400 } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const allLogs = [];
  page.on('console', (m) => allLogs.push(m.type() + ': ' + m.text()));
  page.on('console', (m) => (m.type() === 'error' || m.text().startsWith('Watchdog') || m.text().startsWith('Ação inválida') || m.text().startsWith('Animação travou')) && errors.push(m.text()));

  await page.goto(URL);
  await page.waitForSelector('.modal.start');
  await sleep(800);
  if (shots) await page.screenshot({ path: path.join(OUT, `${label}-1-inicio.png`) });
  await page.click('[data-go]');

  let step = 0;
  let realClickDone = false;
  let trucoDone = false;
  let shotTurn = false;
  let shotBet = false;
  let shotMao10 = false;
  let coverDone = false;
  let signalsDone = false;
  let signalReport = null;
  const seen = new Set();

  while (step++ < maxSteps) {
    let handle;
    try {
      handle = await waitHumanTurnOrModal(page);
    } catch (err) {
      const dump = await page.evaluate(() => {
        const c = window.__truco.controller;
        const s = c.state;
        return { anim: c.currentAnim && { ...c.currentAnim, ageMs: Math.round(performance.now() - c.currentAnim.since) }, botPending: c.botPending, botToken: c.botToken, speed: c.speed, hidden: document.hidden, vis: document.visibilityState, busy: c.busy, phase: s.phase, turn: s.hand.turn, pending: s.hand.pendingBet, round: s.hand.currentRound, mode: s.hand.mode, hands: s.hand.hands.map((h) => h.length), modal: document.querySelector('.modal')?.className };
      });
      await page.screenshot({ path: path.join(OUT, `${label}-TRAVOU.png`) });
      console.log('TRAVOU', JSON.stringify(dump), errors, allLogs.filter((l) => !l.includes('GL Driver')).slice(-15));
      throw err;
    }
    const what = await handle.jsonValue();
    if (what === 'over') break;
    if (what === 'modal') {
      const cls = await page.$eval('.modal', (m) => m.className);
      if (cls.includes('end')) break;
      if (cls.includes('bet')) {
        seen.add('bet');
        if (shots && !shotBet) {
          await sleep(300);
          await page.screenshot({ path: path.join(OUT, `${label}-4-truco.png`) });
          shotBet = true;
        }
        await page.click('[data-a="accept"]');
      } else if (cls.includes('mao10')) {
        seen.add('mao10');
        if (shots && !shotMao10) {
          await sleep(300);
          await page.screenshot({ path: path.join(OUT, `${label}-5-mao-de-10.png`) });
          shotMao10 = true;
        }
        await page.click('[data-p="1"]');
      }
      await sleep(150);
      continue;
    }
    // Sua vez
    if (shots && !shotTurn) {
      await sleep(400);
      await page.screenshot({ path: path.join(OUT, `${label}-2-sua-vez.png`) });
      shotTurn = true;
    }
    if (!signalsDone) {
      signalsDone = true;
      const sig = await testSignals(page, label, shots);
      seen.add('sinais');
      signalReport = sig;
      continue;
    }
    const st = await page.evaluate(() => {
      const s = window.__truco.controller.state;
      return { round: s.hand.currentRound, value: s.hand.value, mode: s.hand.mode, lastRaiser: s.hand.lastRaiser };
    });
    // Pede truco uma vez para testar o fluxo de aposta
    if (!trucoDone && st.mode === 'normal' && st.value === 2) {
      const enabled = await page.$eval('.btn.truco', (b) => !b.disabled);
      if (enabled) {
        await page.click('.bar .btn.truco');
        trucoDone = true;
        seen.add('truco_pedido');
        await sleep(300);
        if (shots) await page.screenshot({ path: path.join(OUT, `${label}-3-pediu-truco.png`) });
        continue;
      }
    }
    if (!realClickDone) {
      // Clique real no canvas, em cima da carta (testa o raycast)
      const pos = await page.evaluate(() => window.__truco.stage.humanCardScreen(0));
      await page.mouse.move(pos.x, pos.y);
      await sleep(250);
      await page.mouse.down();
      await page.mouse.up();
      realClickDone = true;
      seen.add('clique_real');
      await sleep(300);
      continue;
    }
    if (!coverDone && st.round >= 1 && st.mode !== 'mao_de_ferro') {
      const pos = await page.evaluate(() => window.__truco.stage.humanCardScreen(0));
      await page.mouse.click(pos.x, pos.y, { button: 'right' });
      coverDone = true;
      seen.add('coberta');
      await sleep(300);
      continue;
    }
    await page.evaluate(() => window.__truco.controller.onCardClick(0, false));
    await sleep(100);
    if (step === 3) await page.evaluate(() => (window.__truco.controller.speed = 0.15));
  }

  await page.waitForSelector('.modal.end', { timeout: 30000 });
  await sleep(500);
  if (shots) await page.screenshot({ path: path.join(OUT, `${label}-6-fim.png`) });
  const result = await page.evaluate(() => {
    const s = window.__truco.controller.state;
    return { scores: s.scores, winner: s.winner, capote: s.capote, hands: s.hand.number };
  });
  const botSignals = await page.evaluate(() => window.__botSignalCount || 0);
  return { result, errors, seen: [...seen], steps: step, signals: signalReport, botSignalsSeen: botSignals };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const d = await playMatch(desktop, 'desktop');
    console.log('DESKTOP', JSON.stringify(d));
    // Fecha a página do desktop antes do celular: sem GPU, duas páginas WebGL ao mesmo tempo
    // disputam o mesmo renderizador por software e travam a thread principal da segunda.
    await desktop.close();

    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const mobile = await ctx.newPage();
    const m = await playMatch(mobile, 'mobile', { maxSteps: 400 });
    console.log('MOBILE', JSON.stringify(m));

    if (d.errors.length || m.errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
