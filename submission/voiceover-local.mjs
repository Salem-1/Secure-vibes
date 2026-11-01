// Generates the demo voiceover locally with Kokoro (open-source, no API key), one WAV per line.
// One-time setup: npm install --no-save kokoro-js   (the voice model, ~90 MB, downloads on first run)
// Usage: npm run demo:voice:local   then   npm run demo:edit:voice
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'jobs', 'vo'));
const VOICE = process.env.KOKORO_VOICE || 'af_heart';

let KokoroTTS;
try { ({ KokoroTTS } = await import('kokoro-js')); } catch {
  console.error('Kokoro is not installed. Run: npm install --no-save kokoro-js'); process.exit(1);
}
const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'submission', 'promo-script.json'), 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
for (const [i, line] of script.lines.entries()) {
  const audio = await tts.generate(line.text, { voice: VOICE, speed: 1.05 });
  audio.save(path.join(outDir, `line${i}.wav`));
  console.log(`line${i}`, line.text);
}
console.log('voice', VOICE, '→', outDir);
