// Demo mode: type MyAwesomeVibeCodedWebsite.com to get a sample report without scanning anything.
// Useful for demos and promo videos. The sample lives in assets/demo-report.json (fictional site,
// placeholder IP from the 203.0.113.0/24 documentation range).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STEPS } from './scanner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEMO_DOMAIN = (process.env.DEMO_DOMAIN || 'MyAwesomeVibeCodedWebsite.com').toLowerCase();
const SAMPLE = path.join(ROOT, 'assets', 'demo-report.json');

export const isDemo = (domain) =>
  String(domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') === DEMO_DOMAIN;

export async function demoScan(onStep = () => {}) {
  const report = JSON.parse(await fs.readFile(SAMPLE, 'utf8'));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const [i, [key, label]] of STEPS.entries()) {
    onStep({ key, label, state: 'start' });
    await wait(250 + (i % 3) * 120);
    onStep({ key, label, state: 'done', ms: 300 + i * 410 });
  }
  report.startedAt = new Date(Date.now() - 14000).toISOString();
  report.finishedAt = new Date().toISOString();
  return report;
}
