// Generates the promo voiceover with Gemini Flash TTS, one WAV per line.
// Usage: node submission/voiceover.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* no .env */ }
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const VOICE = process.env.GEMINI_TTS_VOICE || 'Puck';
if (!KEY || KEY.startsWith('your-')) { console.error('Set GEMINI_API_KEY in .env'); process.exit(1); }

export const SCRIPT = JSON.parse(fs.readFileSync(path.join(ROOT, 'submission', 'promo-script.json'), 'utf8'));
const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'jobs', 'vo'));
fs.mkdirSync(outDir, { recursive: true });

const STYLE = 'Read this like an upbeat, confident tech product promo for indie developers. Energetic, warm, a little playful, clear pacing:';

for (const [i, line] of SCRIPT.lines.entries()) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${STYLE} ${line.text}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
    }),
  });
  const j = await res.json();
  const b64 = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!res.ok || !b64) { console.error('TTS failed on line', i, JSON.stringify(j).slice(0, 400)); process.exit(1); }
  const pcm = path.join(outDir, `line${i}.pcm`);
  fs.writeFileSync(pcm, Buffer.from(b64, 'base64'));
  const wav = path.join(outDir, `line${i}.wav`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', pcm, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse', wav]);
  fs.rmSync(pcm);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString());
  console.log(`line${i}`, dur.toFixed(2) + 's', line.text);
}
console.log('model', MODEL, 'voice', VOICE);
