import './lib/env.js';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scan } from './lib/scanner.js';
import { renderVideo } from './lib/video.js';
import { aiBrief } from './lib/ai.js';
import { isDemo, demoScan } from './lib/demo.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const JOBS = path.join(ROOT, 'jobs');
await fs.mkdir(JOBS, { recursive: true });

const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));
app.use('/jobs', express.static(JOBS));

const videos = new Map();

app.get('/api/scan', async (req, res) => {
  const { domain, consent } = req.query;
  if (consent !== '1') return res.status(400).json({ error: 'Consent is required to scan a domain.' });
  if (!domain) return res.status(400).json({ error: 'Please enter a domain.' });

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 10000);

  try {
    const demo = isDemo(domain);
    const report = demo ? await demoScan((s) => send('step', s)) : await scan(String(domain), (s) => send('step', s));
    send('step', { key: 'ai', label: 'Gemma 4 writing your executive brief', state: 'start' });
    const t0 = Date.now();
    report.ai = demo && report.ai?.headline ? report.ai : await aiBrief(report);
    send('step', { key: 'ai', label: 'Gemma 4 writing your executive brief', state: 'done', ms: Date.now() - t0 });
    const id = crypto.randomBytes(6).toString('hex');
    const jobDir = path.join(JOBS, id);
    await fs.mkdir(jobDir, { recursive: true });
    await fs.writeFile(path.join(jobDir, 'report.json'), JSON.stringify(report, null, 2));
    const status = { state: 'rendering', pct: 0, url: `/jobs/${id}/report.mp4`, error: null };
    videos.set(id, status);
    send('result', { id, report });
    renderVideo(report, jobDir, (pct) => { status.pct = pct; })
      .then(() => { status.state = 'done'; status.pct = 100; })
      .catch((e) => { status.state = 'error'; status.error = e.message; console.error(e); });
  } catch (e) {
    send('fail', { error: e.message });
  } finally {
    clearInterval(ping);
    res.end();
  }
});

app.get('/api/video/:id', (req, res) => {
  const s = videos.get(req.params.id);
  if (!s) return res.status(404).json({ state: 'unknown' });
  res.json(s);
});

app.post('/api/subscribe', async (req, res) => {
  const { email, domain, plan } = req.body || {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  const file = path.join(JOBS, 'subscribers.json');
  let list = [];
  try { list = JSON.parse(await fs.readFile(file, 'utf8')); } catch { /* new file */ }
  list.push({ email, domain, plan, at: new Date().toISOString() });
  await fs.writeFile(file, JSON.stringify(list, null, 2));
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Secure Vibes running at http://localhost:${PORT}`));
