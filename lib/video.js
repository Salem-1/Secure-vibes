// Builds a per-scan HyperFrames composition (HTML → MP4) and renders it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HF_BIN = path.join(ROOT, 'node_modules', '.bin', 'hyperframes');
const DUR = 32;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEVC = { critical: '#ff3b5c', high: '#ff8a3d', medium: '#ffc93d', low: '#5fb8ff', info: '#8b93a7', pass: '#2ee59d' };
const GRADEC = { A: '#2ee59d', B: '#9be15d', C: '#ffc93d', D: '#ff8a3d', F: '#ff3b5c' };

function rng(seed) { // deterministic PRNG (mulberry32)
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

export function buildComposition(report) {
  const { target, summary, findings } = report;
  const domain = target.host;
  const R = rng(hash(domain));
  const issues = findings.filter((f) => !['pass', 'info'].includes(f.severity));
  const top = issues.slice(0, 3);
  while (top.length < 3) {
    const p = findings.filter((f) => f.severity === 'pass')[top.length] || { severity: 'pass', title: 'No further major issues', impact: 'Keep monitoring: new weaknesses appear every week.', category: '' };
    top.push(p);
  }
  const gc = GRADEC[summary.grade];
  const c = summary.counts;
  const subs = report.subdomains?.count || 0;
  const ports = (report.ports?.open || []).length;
  const third = (report.page?.thirdParty || []).length;
  const totalIssues = issues.length;

  // attack surface nodes
  const nodes = [];
  const addNodes = (n, label, color, ring) => {
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, r = ring + R() * 120;
      nodes.push({ x: 960 + Math.cos(a) * r * 1.5, y: 520 + Math.sin(a) * r * 0.82, color, label: i < 3 ? label(i) : '' });
    }
  };
  const subNames = report.subdomains?.sample || [];
  addNodes(Math.min(subs, 26), (i) => subNames[i] || '', '#5fb8ff', 230);
  addNodes(Math.min(third, 10), (i) => report.page.thirdParty[i] || '', '#b18cff', 330);
  addNodes(ports, (i) => `port ${report.ports.open[i].port}`, '#ff3b5c', 180);
  const nodeHtml = nodes.map((n, i) => `
      <div class="edge" id="e${i}" style="left:960px;top:520px;width:${Math.hypot(n.x - 960, n.y - 520)}px;transform:rotate(${Math.atan2(n.y - 520, n.x - 960)}rad)"></div>`).join('') +
    nodes.map((n, i) => `
      <div class="node" id="n${i}" style="left:${n.x - 9}px;top:${n.y - 9}px;background:${n.color};box-shadow:0 0 18px ${n.color}"><span>${esc(n.label)}</span></div>`).join('');

  const riskCards = top.map((f, i) => `
      <div class="risk" id="risk${i}" style="--c:${SEVC[f.severity]}">
        <div class="sev">${f.severity === 'pass' ? 'GOOD NEWS' : esc(f.severity.toUpperCase()) + ' RISK'} · ${esc(f.category)}</div>
        <div class="rtitle">${esc(f.title)}</div>
        <div class="rimpact">${esc(f.impact)}</div>
      </div>`).join('');

  const circ = 2 * Math.PI * 200;
  const dash = circ * (1 - summary.score / 100);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<script src="assets/gsap.min.js"></script>
<style>
  :root { --ground:#05070d; --ink:#eef2ff; --dim:#8b93a7; --accent:#29e3ff; --grade:${gc}; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:1920px; height:1080px; overflow:hidden; background:var(--ground); }
  #root { width:100%; height:100%; position:relative; font-family:Inter, sans-serif; color:var(--ink); }
  .bg { position:absolute; inset:0; background:
      radial-gradient(1200px 700px at 50% 40%, rgba(41,227,255,.10), transparent 60%),
      linear-gradient(rgba(41,227,255,.06) 1px, transparent 1px) 0 0/80px 80px,
      linear-gradient(90deg, rgba(41,227,255,.06) 1px, transparent 1px) 0 0/80px 80px, var(--ground); }
  .scanline { position:absolute; left:0; right:0; height:3px; top:0; background:linear-gradient(90deg,transparent,var(--accent),transparent); box-shadow:0 0 30px var(--accent); opacity:.8; }
  .brand { position:absolute; top:70px; left:110px; font:700 30px 'JetBrains Mono', monospace; letter-spacing:.2em; color:var(--accent); }
  .brand b { color:var(--ink); }
  .scene { position:absolute; inset:0; }
  .center { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; }
  .mono { font-family:'JetBrains Mono', monospace; }
  .kicker { font:500 34px 'JetBrains Mono', monospace; color:var(--dim); letter-spacing:.08em; }
  .domain { font:900 130px Inter, sans-serif; letter-spacing:-.04em; margin:22px 0; color:#fff; text-shadow:0 0 60px rgba(41,227,255,.45); }
  .sub { font:400 54px Inter, sans-serif; color:var(--ink); }
  .stats { display:flex; gap:40px; margin-top:60px; }
  .stat { width:300px; padding:34px 20px; border-radius:24px; background:rgba(255,255,255,.04); border:2px solid var(--c); text-align:center; }
  .stat .num { font:900 120px Inter, sans-serif; color:var(--c); line-height:1; }
  .stat .lab { font:700 26px 'JetBrains Mono', monospace; letter-spacing:.15em; margin-top:14px; color:var(--ink); }
  .big { font:900 96px Inter, sans-serif; letter-spacing:-.03em; }
  .ringwrap { position:absolute; left:260px; top:190px; width:700px; height:700px; }
  .ringwrap svg { width:700px; height:700px; }
  .gradeletter { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font:900 330px Inter, sans-serif; color:var(--grade); text-shadow:0 0 80px var(--grade); }
  .gradetext { position:absolute; left:1040px; top:330px; width:720px; }
  .gradetext .score { font:900 150px Inter, sans-serif; color:var(--grade); line-height:1; }
  .gradetext .score small { font-size:60px; color:var(--dim); }
  .gradetext p { font:400 46px Inter, sans-serif; margin-top:24px; line-height:1.25; }
  .risk { position:absolute; left:210px; top:300px; width:1500px; padding:60px 70px; border-radius:28px; background:linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,.02)); border-left:14px solid var(--c); box-shadow:0 30px 120px rgba(0,0,0,.6), 0 0 80px -20px var(--c); opacity:0; }
  .risk .sev { font:700 30px 'JetBrains Mono', monospace; letter-spacing:.14em; color:var(--c); }
  .risk .rtitle { font:800 70px Inter, sans-serif; letter-spacing:-.02em; margin:22px 0; line-height:1.08; }
  .risk .rimpact { font:400 42px Inter, sans-serif; color:#c9d1e6; line-height:1.3; }
  .risktag { position:absolute; top:190px; left:210px; font:700 34px 'JetBrains Mono', monospace; letter-spacing:.14em; color:var(--dim); }
  .edge { position:absolute; height:2px; transform-origin:0 50%; background:linear-gradient(90deg, rgba(41,227,255,.6), rgba(41,227,255,.05)); opacity:0; }
  .node { position:absolute; width:18px; height:18px; border-radius:50%; opacity:0; }
  .node span { position:absolute; left:26px; top:-6px; white-space:nowrap; font:500 20px 'JetBrains Mono', monospace; color:#c9d1e6; }
  .core { position:absolute; left:860px; top:420px; width:200px; height:200px; border-radius:50%; background:radial-gradient(circle, #29e3ff 0%, #0b6b8a 55%, transparent 72%); box-shadow:0 0 120px #29e3ff; }
  .corelabel { position:absolute; left:0; right:0; top:650px; text-align:center; font:800 44px Inter, sans-serif; }
  .surface-cap { position:absolute; left:0; right:0; bottom:110px; text-align:center; font:500 40px Inter, sans-serif; color:#c9d1e6; }
  .surface-cap b { color:#fff; }
  .cta-btn { margin-top:56px; padding:34px 70px; border-radius:999px; font:800 50px Inter, sans-serif; color:#05070d; background:linear-gradient(90deg,#29e3ff,#2ee59d); box-shadow:0 0 90px rgba(41,227,255,.6); }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="1920" data-height="1080">
  <div id="bg" class="bg clip" data-start="0" data-duration="${DUR}" data-track-index="0"><div class="scanline" id="scan"></div></div>
  <div id="brand" class="brand clip" data-start="0" data-duration="${DUR}" data-track-index="1">Secure<b>Vibes</b></div>

  <div id="s1" class="scene clip" data-start="0" data-duration="4.5" data-track-index="2">
    <div class="center" id="h1">
      <div class="big" id="h1a">You vibe-coded it. Bots are already scanning it.</div>
      <div class="sub" id="h1b" style="margin-top:28px;color:#ff3b5c">Looking for the one door AI left open.</div>
    </div>
    <div class="center">
      <div class="kicker" id="s1k">SO WE RAN THE SAME SCAN ON</div>
      <div class="domain" id="s1d" style="font-size:${Math.min(130, Math.floor(1650 / (domain.length * 0.6)))}px">${esc(domain)}</div>
      <div class="sub" id="s1s">Here's what they found.</div>
    </div>
  </div>

  <div id="s2" class="scene clip" data-start="4.5" data-duration="5" data-track-index="2">
    <div class="center">
      <div class="big" id="s2t"><span id="cnt">0</span> security issues found</div>
      <div class="kicker" id="s2k" style="margin-top:20px;max-width:1500px;line-height:1.35">${report.ai?.headline ? esc(report.ai.headline) + ' <span style="color:#29e3ff">· Gemma 4</span>' : 'in under a minute, from the outside, with zero access'}</div>
      <div class="stats">
        <div class="stat" id="st0" style="--c:${SEVC.critical}"><div class="num">${c.critical}</div><div class="lab">CRITICAL</div></div>
        <div class="stat" id="st1" style="--c:${SEVC.high}"><div class="num">${c.high}</div><div class="lab">HIGH</div></div>
        <div class="stat" id="st2" style="--c:${SEVC.medium}"><div class="num">${c.medium}</div><div class="lab">MEDIUM</div></div>
        <div class="stat" id="st3" style="--c:${SEVC.low}"><div class="num">${c.low}</div><div class="lab">LOW</div></div>
      </div>
    </div>
  </div>

  <div id="s3" class="scene clip" data-start="9.5" data-duration="5" data-track-index="2">
    <div class="ringwrap">
      <svg viewBox="0 0 500 500"><circle cx="250" cy="250" r="200" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="28"/>
        <circle id="ring" cx="250" cy="250" r="200" fill="none" stroke="${gc}" stroke-width="28" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ}" transform="rotate(-90 250 250)"/></svg>
      <div class="gradeletter" id="gl">${summary.grade}</div>
    </div>
    <div class="gradetext" id="gt">
      <div class="kicker">YOUR SECURITY GRADE</div>
      <div class="score"><span id="sc">0</span><small> / 100</small></div>
      <p>${summary.grade <= 'B' ? 'A solid start, but attackers only need one open door.' : 'Attackers run this same scan, automatically, every single day.'}</p>
    </div>
  </div>

  <div id="s4" class="scene clip" data-start="14.5" data-duration="9" data-track-index="2">
    <div class="risktag" id="rt">WHAT AN ATTACKER SEES FIRST</div>${riskCards}
  </div>

  <div id="s5" class="scene clip" data-start="23.5" data-duration="4.5" data-track-index="2">${nodeHtml}
    <div class="core" id="core"></div>
    <div class="corelabel" id="cl">${esc(domain)}</div>
    <div class="surface-cap" id="cap"><b>${subs}</b> public subdomains · <b>${ports}</b> exposed services · <b>${third}</b> third-party script sources. Every one is a door.</div>
  </div>

  <div id="s6" class="scene clip" data-start="28" data-duration="4" data-track-index="2">
    <div class="center">
      <div class="big" id="c1" style="font-size:80px">How bad can it go? We just showed you.</div>
      <div class="sub" id="c2" style="margin-top:26px;color:#c9d1e6">Every risk here is fixable. Secure Vibes tells you exactly how to fix it, in plain English.</div>
      <div class="cta-btn" id="c3">Scan your vibe at Secure Vibes →</div>
    </div>
  </div>

  <audio id="music" class="clip" src="assets/music.wav" data-start="0" data-duration="${DUR}" data-track-index="5"></audio>
</div>
<script>
  const tl = gsap.timeline({ paused: true });
  tl.fromTo('#scan', { y: -10 }, { y: 1090, duration: 4, ease: 'none' }, 0)
    .fromTo('#scan', { y: -10 }, { y: 1090, duration: 4, ease: 'none' }, 9.5)
    .fromTo('#scan', { y: -10 }, { y: 1090, duration: 4, ease: 'none' }, 23.5)
    .from('#brand', { opacity: 0, x: -30, duration: .6, ease: 'power3.out' }, .1)
    // s1
    .from('#h1a', { opacity: 0, y: 30, filter: 'blur(10px)', duration: .7, ease: 'expo.out' }, .1)
    .from('#h1b', { opacity: 0, y: 20, duration: .5, ease: 'power3.out' }, .8)
    .to('#h1', { opacity: 0, scale: 1.08, duration: .35, ease: 'power2.in' }, 1.9)
    .fromTo('#s1k', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .4, ease: 'power3.out' }, 2.2)
    .fromTo('#s1d', { opacity: 0, scale: .85, filter: 'blur(14px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: .7, ease: 'expo.out' }, 2.4)
    .fromTo('#s1s', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: .5, ease: 'power3.out' }, 3.0)
    .to(['#s1k', '#s1d', '#s1s'], { opacity: 0, y: -30, duration: .4, stagger: .05, ease: 'power2.in' }, 3.9)
    // s2
    .from('#s2t', { opacity: 0, y: 30, duration: .5, ease: 'power3.out' }, 4.6)
    .fromTo('#cnt', { textContent: 0 }, { textContent: ${totalIssues}, duration: 1.4, snap: { textContent: 1 }, ease: 'power2.out' }, 4.6)
    .from('#s2k', { opacity: 0, duration: .5 }, 5.2)
    .from(['#st0', '#st1', '#st2', '#st3'], { opacity: 0, y: 60, scale: .9, duration: .55, stagger: .15, ease: 'back.out(1.6)' }, 5.6)
    .to(['#s2t', '#s2k', '#st0', '#st1', '#st2', '#st3'], { opacity: 0, duration: .35 }, 9.05)
    // s3
    .to('#ring', { attr: { 'stroke-dashoffset': ${dash.toFixed(1)} }, duration: 2, ease: 'power2.out' }, 9.7)
    .fromTo('#sc', { textContent: 0 }, { textContent: ${summary.score}, duration: 2, snap: { textContent: 1 }, ease: 'power2.out' }, 9.7)
    .from('#gl', { opacity: 0, scale: 2.4, duration: .55, ease: 'expo.out' }, 11.5)
    .from('#gt', { opacity: 0, x: 60, duration: .7, ease: 'power3.out' }, 9.9)
    .to(['#gl', '#gt', '#ring'], { opacity: 0, duration: .35 }, 14.05)
    // s4 — three risk cards, 3s each
    .from('#rt', { opacity: 0, y: -20, duration: .4 }, 14.6)
    ${[0, 1, 2].map((i) => `.fromTo('#risk${i}', { opacity: 0, x: 140 }, { opacity: 1, x: 0, duration: .6, ease: 'expo.out' }, ${14.7 + i * 2.9})
    .to('#risk${i}', { opacity: 0, x: -140, duration: .4, ease: 'power2.in' }, ${17.2 + i * 2.9})`).join('\n    ')}
    // s5 — attack surface
    .from('#core', { scale: 0, duration: .7, ease: 'back.out(2)' }, 23.6)
    .from('#cl', { opacity: 0, duration: .5 }, 23.9)
    ${nodes.length ? `.to([${nodes.map((_, i) => `'#e${i}'`).join(',')}], { opacity: 1, duration: .3, stagger: ${(1.6 / nodes.length).toFixed(3)} }, 24.1)
    .to([${nodes.map((_, i) => `'#n${i}'`).join(',')}], { opacity: 1, duration: .3, stagger: ${(1.6 / nodes.length).toFixed(3)} }, 24.2)` : ''}
    .from('#cap', { opacity: 0, y: 30, duration: .6 }, 25.4)
    .to('#s5 > *', { opacity: 0, duration: .35 }, 27.6)
    // s6
    .from('#c1', { opacity: 0, y: 40, duration: .6, ease: 'power3.out' }, 28.1)
    .from('#c2', { opacity: 0, duration: .5 }, 28.7)
    .from('#c3', { opacity: 0, scale: .8, duration: .7, ease: 'back.out(1.8)' }, 29.2);
  window.__timelines["main"] = tl;
  tl.seek(0);
</script>
</body>
</html>`;
  return html;
}

export async function renderVideo(report, jobDir, onProgress = () => {}) {
  jobDir = path.resolve(jobDir);
  const vdir = path.join(jobDir, 'video');
  await fs.mkdir(path.join(vdir, 'assets'), { recursive: true });
  await fs.copyFile(path.join(ROOT, 'assets', 'gsap.min.js'), path.join(vdir, 'assets', 'gsap.min.js'));
  await fs.copyFile(path.join(ROOT, 'assets', 'music.wav'), path.join(vdir, 'assets', 'music.wav'));
  await fs.writeFile(path.join(vdir, 'index.html'), buildComposition(report));
  await fs.writeFile(path.join(vdir, 'hyperframes.json'), JSON.stringify({ name: 'secure-vibes-briefing' }));
  const out = path.join(jobDir, 'report.mp4');
  await new Promise((resolve, reject) => {
    const p = spawn(HF_BIN, ['render', '--output', out, '--quality', 'standard'], { cwd: vdir, env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1', CI: '1' } });
    let log = '';
    const onData = (b) => {
      const s = b.toString(); log += s;
      const m = s.match(/(\d{1,3})%/g);
      if (m) onProgress(Number(m[m.length - 1].replace('%', '')));
    };
    p.stdout.on('data', onData); p.stderr.on('data', onData);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('render failed: ' + log.slice(-600)))));
  });
  return out;
}
