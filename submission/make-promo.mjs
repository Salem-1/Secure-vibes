// Cuts the raw v2 recording to its key moments and mixes the Gemini voiceover over the music.
// Usage: node submission/make-promo.mjs <raw.webm> <voDir|none> <out.mp4> [briefing.mp4]
// Pass 'none' as voDir for a music-only cut.
// With briefing.mp4, the 'video' segment cuts to the briefing video full screen.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [raw, voDir, out, brief] = process.argv.slice(2);
const m = JSON.parse(fs.readFileSync(raw + '.marks.json', 'utf8'));
const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'submission', 'promo-script.json'), 'utf8'));
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

// Segments of the raw recording: [from, to, speed]
const segs = [
  { name: 'start', from: 0, to: m.scanStart, speed: 1 },
  { name: 'scan', from: m.scanStart, to: m.reportShown, speed: 2 },
  { name: 'report', from: m.reportShown, to: m.reportShown + 6, speed: 1 },
  { name: 'scroll', from: m.reportShown + 6, to: m.scrollDone, speed: 1 },
  { name: 'video', from: m.videoStart, to: m.ctaMove, speed: 1 },
  // End on the button press itself (before the sign-up box opens)
  { name: 'cta', from: m.ctaMove, to: m.ctaClick ? m.ctaClick + 0.03 : m.end, speed: 1 },
];
// The full-screen part shows the whole briefing video, never past its end
if (brief) { const v = segs.find((x) => x.name === 'video'); v.to = Math.min(v.to, v.from + dur(brief) - 0.05); }
let t = 0;
for (const s of segs) { s.at = t; t += (s.to - s.from) / s.speed; }
const total = t;
const anchorAt = Object.fromEntries(segs.map((s) => [s.name, s.at]));

// Place voice lines, never overlapping
let cursor = 0; const placed = [];
(voDir === 'none' ? [] : script.lines).forEach((l, i) => {
  const f = path.join(voDir, `line${i}.wav`);
  const at = Math.max(anchorAt[l.anchor] + (l.offset || 0), cursor + 0.25);
  const d = dur(f);
  placed.push({ f, at, d, text: l.text });
  cursor = at + d;
});
const end = Math.max(total + 1.5, cursor + 1.2); // hold the last frame
placed.forEach((p) => console.log(p.at.toFixed(1).padStart(5), '→', (p.at + p.d).toFixed(1).padStart(5), p.text));
console.log('video length', end.toFixed(1));

const VO0 = brief ? 3 : 2; // index of the first voice input
const vparts = segs.map((s, i) => brief && s.name === 'video'
  ? `[2:v]trim=0:${(s.to - s.from).toFixed(3)},setpts=PTS-STARTPTS,scale=1600:900,setsar=1[v${i}]`
  : `[0:v]trim=${s.from.toFixed(3)}:${s.to.toFixed(3)},setpts=(PTS-STARTPTS)/${s.speed},scale=1600:900,setsar=1[v${i}]`);
const lastHold = end - total;
const vfilter = `${vparts.join(';')};${segs.map((_, i) => `[v${i}]`).join('')}concat=n=${segs.length}:v=1:a=0,tpad=stop_mode=clone:stop_duration=${lastHold.toFixed(2)},fps=30,scale=1600:-2,format=yuv420p[v]`;
const inputs = ['-i', raw, '-stream_loop', '2', '-i', path.join(ROOT, 'assets', 'music.wav')];
if (brief) inputs.push('-i', brief);
placed.forEach((p) => inputs.push('-i', p.f));
const voice = placed.map((p, i) => `[${i + VO0}:a]aresample=44100,volume=1.6,adelay=${Math.round(p.at * 1000)}:all=1[a${i}]`);
const afilter = !placed.length
  ? `[1:a]atrim=0:${end.toFixed(2)},volume=0.8,afade=t=in:d=1,afade=t=out:st=${(end - 2.5).toFixed(2)}:d=2.5[aout]`
  : `${voice.join(';')};${placed.map((_, i) => `[a${i}]`).join('')}amix=inputs=${placed.length}:normalize=0,asplit=2[vo][vo2];` +
  `[1:a]atrim=0:${end.toFixed(2)},volume=0.45,afade=t=in:d=1,afade=t=out:st=${(end - 2.5).toFixed(2)}:d=2.5[bed];` +
  `[bed][vo]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck];[duck][vo2]amix=inputs=2:normalize=0,alimiter=limit=0.95[aout]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', `${vfilter};${afilter}`, '-map', '[v]', '-map', '[aout]', '-t', end.toFixed(2), '-c:v', 'libx264', '-crf', '22', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out]);
console.log('wrote', out);
