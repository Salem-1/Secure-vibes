// Records the promo walkthrough: types the demo domain, scans, scrolls the report, plays the video, clicks "Fix my vibe".
// Usage: npm run demo:record   (server must be running on http://localhost:3000; set CHROME_PATH if Chrome is not in /Applications)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const out = process.argv[2];
const DOMAIN = 'MyAwesomeVibeCodedWebsite.com';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1600,1000'], defaultViewport: { width: 1600, height: 900 } });
const page = await browser.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// A visible cursor (screen recordings don't capture the real one)
await page.evaluateOnNewDocument(() => {
  window.addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.id = '__cursor';
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6-3.6 6.9z" fill="#fff" stroke="#061224" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(800px,450px)', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.5))', transition: 'scale .12s' });
    document.body.appendChild(c);
    document.addEventListener('mousemove', (e) => { c.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 2}px)`; }, true);
    document.addEventListener('mousedown', () => { c.style.scale = '0.8'; }, true);
    document.addEventListener('mouseup', () => { c.style.scale = '1'; }, true);
  });
});

let pos = { x: 800, y: 450 };
async function moveTo(sel) {
  const el = await page.waitForSelector(sel, { visible: true });
  await el.scrollIntoView();
  await wait(350);
  const b = await el.boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.move(x, y, { steps: 28 });
  pos = { x, y };
  await wait(250);
}
async function click(sel) { await moveTo(sel); await page.mouse.down(); await wait(90); await page.mouse.up(); }
// (CTA clicks below also call element.click() so a stray hit on the video can't steal them)

await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
const rec = await page.screencast({ path: out });
const t0 = Date.now(); const marks = {};
const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; console.log(k, marks[k]); };
await wait(2500);
await click('#domain'); await page.keyboard.type(DOMAIN, { delay: 55 });
await click('#consent');
await click('#scanBtn'); mark('scanStart');
await page.waitForFunction(() => /exposure/.test(document.querySelector('#mTitle').textContent), { timeout: 120000 });
mark('reportShown');
await page.mouse.move(1200, 500, { steps: 20 }); pos = { x: 1200, y: 500 };
await wait(6000);
for (let i = 0; i < 6; i++) { await page.evaluate(() => document.querySelector('.mbody').scrollBy({ top: 280, behavior: 'smooth' })); await wait(1300); }
mark('scrollDone');
await page.waitForSelector('#vEl', { timeout: 180000 });
await page.evaluate(() => { const v = document.querySelector('#vEl'); v.scrollIntoView({ block: 'center' }); v.currentTime = 0; v.play(); });
mark('videoStart');
await wait(19000); // hook → issues → grade → first risk
await page.evaluate(async () => { const v = document.querySelector('#vEl'); v.pause(); if (document.fullscreenElement) await document.exitFullscreen(); });
mark('ctaMove');
await moveTo('#fullBtn');
await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousedown'))); await wait(110);
await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup')));
await page.$eval('#fullBtn', (b) => b.click()); mark('ctaClick');
await wait(400);
await moveTo('#email');
await page.$eval('#email', (e) => e.focus());
await page.keyboard.type('founder@myawesomevibecodedwebsite.com', { delay: 40 });
await moveTo('#subForm button[type=submit]');
await page.$eval('#subForm', (f) => f.requestSubmit()); mark('subscribed');
await wait(3500);
mark('end');
await rec.stop(); await browser.close();
fs.writeFileSync(out + '.marks.json', JSON.stringify(marks));
console.log('done');
