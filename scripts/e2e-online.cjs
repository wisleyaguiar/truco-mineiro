// E2E do modo online contra a API local (npm run dev:api) + Vite com VITE_DEV_AUTH=1.
// Uso: node scripts/e2e-online.cjs [url] [pastaDeSaida]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = process.argv[2] || 'http://localhost:5173/';
const OUT = process.argv[3] || path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  try {
    await page.goto(URL);
    await page.waitForSelector('[data-online]');
    await page.click('[data-online]');
    await page.fill('#email', 'jogador@teste.com');
    await page.click('[data-send]');
    await page.waitForSelector('#nick');
    await page.screenshot({ path: path.join(OUT, 'online-1-apelido.png') });
    await page.fill('#nick', 'Tião Teste');
    await page.click('[data-save]');
    await page.waitForSelector('[data-play]');
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, 'online-2-lobby.png') });
    await page.click('[data-play]');
    await page.evaluate(() => (window.__truco.controller.speed = 0.15));

    let steps = 0;
    let shotTurn = false;
    for (;;) {
      if (steps++ > 400) throw new Error('partida não terminou');
      const what = await page.waitForFunction(
        () => {
          const c = window.__truco.controller;
          const modal = document.querySelector('.modal:not(.hidden)');
          if (modal && /end|bet|mao10/.test(modal.className)) return modal.className;
          const r = c.remote;
          if (!r || c.busy) return false;
          if (r.status !== 'active') return 'over';
          if (r.view.phase === 'playing' && r.view.turn === 0) return 'turn';
          return false;
        },
        null,
        { timeout: 60000, polling: 100 },
      ).then((h) => h.jsonValue());
      if (String(what).includes('end') || what === 'over') break;
      if (String(what).includes('bet')) {
        await page.click('[data-a="accept"]');
      } else if (String(what).includes('mao10')) {
        await page.click('[data-p="1"]');
      } else {
        if (!shotTurn) {
          await sleep(300);
          await page.screenshot({ path: path.join(OUT, 'online-3-mesa.png') });
          shotTurn = true;
        }
        await page.evaluate(() => window.__truco.controller.onCardClick(0, false));
      }
      await sleep(150);
    }
    await page.waitForSelector('.modal.end', { timeout: 30000 });
    const result = await page.evaluate(() => {
      const r = window.__truco.controller.remote;
      return { status: r.status, scores: r.view.scores, version: r.version };
    });
    await page.screenshot({ path: path.join(OUT, 'online-4-fim.png') });
    // Volta ao menu → online → histórico
    await page.click('[data-menu]');
    await page.click('[data-online]');
    await page.waitForSelector('[data-history]');
    const stats = await page.$eval('.stats', (e) => e.innerText.replace(/\s+/g, ' '));
    await page.click('[data-history]');
    await page.waitForSelector('.history li');
    const history = await page.$$eval('.history li', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
    await page.screenshot({ path: path.join(OUT, 'online-5-historico.png') });
    console.log('ONLINE', JSON.stringify({ result, stats, history, errors, steps }));
    if (errors.length || result.status !== 'finished' || history.length !== 1) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
