// Ring til en ven: Sofie ringer, Selmas telefon ringer, hun tager den, de taler
// sammen, og der lægges på (public/opkald.js + public/venner.js + src/opkald.mjs).
//
// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/opkald.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4185 -d public)
//
// Som test/beskeder.test.mjs har Sofie og Selma hver sit vindue med sit eget
// localStorage, men de deler API'et i hukommelsen (mockApi … { delMed }).
//
// WebRTC og mikrofonen er byttet ud med en attrap: samme API, men forbindelsen
// «kommer igennem», så snart begge sider har lagt deres beskrivelse. Det er
// signaleringen og skærmene, testen beviser — selve lyden er browserens sag og
// kan ikke høres i en headless test alligevel.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4185';
const shots = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');

const browser = await chromium.launch();
const fejl = [];

/** Et vindue med et navn i localStorage – og en attrap i stedet for WebRTC og mikrofon. */
async function telefon(navn, delMed) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  page.on('pageerror', e => fejl.push(navn + ': ' + e));
  page.on('console', m => { if (m.type() === 'error') fejl.push(navn + ': ' + m.text()); });
  await page.addInitScript(n => { localStorage.setItem('zydy.navn', n); }, navn);
  await page.addInitScript(() => {
    // Attrappen taler samme sprog som den rigtige RTCPeerConnection, men bliver
    // «connected» i samme nu, begge beskrivelser er lagt — ingen rigtige net.
    class AttrapRTC extends EventTarget {
      constructor() {
        super();
        this.localDescription = null;
        this.remoteDescription = null;
        this.iceGatheringState = 'new';
        this.connectionState = 'new';
      }
      addTrack() {}
      async createOffer() { return { type: 'offer', sdp: 'attrap-tilbud' }; }
      async createAnswer() { return { type: 'answer', sdp: 'attrap-svar' }; }
      async setLocalDescription(d) {
        this.localDescription = d;
        this.iceGatheringState = 'complete';
        this.dispatchEvent(new Event('icegatheringstatechange'));
        this._tjek();
      }
      async setRemoteDescription(d) { this.remoteDescription = d; this._tjek(); }
      _tjek() {
        if (!this.localDescription || !this.remoteDescription || this.connectionState !== 'new') return;
        this.connectionState = 'connecting';
        setTimeout(() => {
          if (this.connectionState === 'closed') return;
          this.connectionState = 'connected';
          const e = new Event('track');
          e.streams = [new MediaStream()];
          this.dispatchEvent(e);
          this.dispatchEvent(new Event('connectionstatechange'));
        }, 50);
      }
      close() { this.connectionState = 'closed'; }
    }
    window.RTCPeerConnection = AttrapRTC;
    const spor = () => ({ kind: 'audio', enabled: true, stop() {} });
    const stroem = () => { const s = spor(); return { getTracks: () => [s], getAudioTracks: () => [s] }; };
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {} });
    navigator.mediaDevices.getUserMedia = () => Promise.resolve(stroem());
  });
  const api = await mockApi(page, delMed ? { delMed } : {});
  return { page, api };
}

const sofie = await telefon('Sofie');
const selma = await telefon('Selma', sofie.api);
const api = sofie.api;

// De to er venner i forvejen – det er venskabet, der giver lov til at ringe.
await api.venner.spoerg('sofie', 'selma', 'Sofie', 'Selma');
await api.venner.sigJa('sofie', 'selma', 'Selma');

/** Der kigges hvert par sekunder i drift – i testen beder vi selv om det. */
const kig = p => p.evaluate(() => window.Opkald.hent());

await sofie.page.goto(`${BASE}/`);
await selma.page.goto(`${BASE}/`);

/* ---------- Sofie ringer op fra venne-dialogen ---------- */
await sofie.page.waitForSelector('#venner .v-ven');
await sofie.page.click('#venner .v-ven');
await sofie.page.waitForSelector('.v-dlg[open]');
assert.equal(await sofie.page.locator('.v-ring').textContent(), '📞 Ring til Selma');
await sofie.page.click('.v-ring');

await sofie.page.waitForSelector('#opkald:not([hidden])');
assert.equal(await sofie.page.locator('.v-dlg[open]').count(), 0, 'venne-dialogen lukker, når man ringer');
await sofie.page.waitForSelector('.o-tekst:text-matches("Ringer til Selma")');
assert.equal(api.opkald.rows.length, 1);
assert.equal(api.opkald.rows[0].status, 'ringer');
assert.match(api.opkald.rows[0].tilbud, /attrap-tilbud/, 'tilbuddet ligger på serveren');

/* ---------- Selmas telefon ringer ---------- */
await kig(selma.page);
await selma.page.waitForSelector('.o-ringer-ind');
assert.match(await selma.page.locator('.o-stor').textContent(), /📞 Sofie ringer til dig!/);
await selma.page.screenshot({ path: path.join(shots, 'opkald-ringer.png') });

/* ---------- … hun tager den, og de taler sammen ---------- */
await selma.page.click('.o-svar');
await selma.page.waitForSelector('.o-tekst:text-matches("Du taler med Sofie")');
assert.equal(api.opkald.rows[0].status, 'igang');
assert.match(api.opkald.rows[0].svar, /attrap-svar/, 'svaret ligger på serveren');

await kig(sofie.page);                       // Sofie henter svaret og forbinder
await sofie.page.waitForSelector('.o-tekst:text-matches("Du taler med Selma")');
await sofie.page.waitForSelector('.o-tid');
await sofie.page.screenshot({ path: path.join(shots, 'opkald-taler.png') });

/* ---------- Lyd fra og til ---------- */
assert.equal(await sofie.page.locator('.o-lydfra').textContent(), '🎤 Lyd fra');
await sofie.page.click('.o-lydfra');
assert.equal(await sofie.page.locator('.o-lydfra').textContent(), '🔇 Lyd til');
assert.equal(await sofie.page.evaluate(() =>
  window.Opkald.session.stroem.getAudioTracks()[0].enabled), false, 'mikrofonen er slået fra');
await sofie.page.click('.o-lydfra');

/* ---------- Sofie lægger på – og begge får det at vide ---------- */
await sofie.page.click('.o-laegpaa');
await sofie.page.waitForSelector('.o-slut:text-matches("I talte sammen i")');
assert.equal(api.opkald.rows[0].status, 'slut');
assert.equal(await sofie.page.evaluate(() => window.Opkald.session), null);

await kig(selma.page);
await selma.page.waitForSelector('.o-slut:text-matches("Sofie lagde på")');
assert.equal(await selma.page.evaluate(() => window.Opkald.session), null);
await selma.page.click('.o-ok');
await selma.page.waitForSelector('#opkald', { state: 'hidden' });

/* ---------- Den anden vej: Selma ringer, og Sofie siger nej tak ---------- */
await sofie.page.click('.o-ok');
await selma.page.evaluate(() => window.Opkald.ring('Sofie'));
await selma.page.waitForSelector('.o-tekst:text-matches("Ringer til Sofie")');
await kig(sofie.page);
await sofie.page.waitForSelector('.o-ringer-ind');
await sofie.page.click('.o-afvis');
await sofie.page.waitForSelector('.o-ringer-ind', { state: 'detached' });

await kig(selma.page);
await selma.page.waitForSelector('.o-slut:text-matches("Sofie tog den ikke")');
assert.equal(api.opkald.rows[0].status, 'slut');

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
for (const p of [sofie.page, selma.page]) {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
}
assert.deepEqual(fejl, [], 'ingen console-fejl');
await browser.close();
console.log('OK opkald');
