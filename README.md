# Secure Vibes

**You vibe-coded it. Is it secure?** Paste your URL and see what attackers see in 60 seconds.

Secure Vibes runs a quick, read-only external security check on a website, then gives you:

- a **plain-English risk report** with an exposure score and a fix for every finding,
- an **AI executive brief written by Gemma 4**: what an attacker could do, the business impact, the top 3 fixes, and a line for your investors,
- a **personal 32-second briefing video**, rendered from HTML with HyperFrames.

Built for founders who ship fast with Cursor, Lovable, Bolt, Replit or Claude Code.

🏆 Winner, **Best Use of Gemma 4** at the hackathon it was built for.

## Demo

| File | What it is |
| --- | --- |
| [`submission/demo.mp4`](submission/demo.mp4) | 52-second walkthrough: URL in → live scan → report and Gemma 4 brief → personal video → "Fix my vibe" sign-up |
| [`submission/briefing-video.mp4`](submission/briefing-video.mp4) | The personal briefing video the app generates for each scan |
| [`submission/Secure-Vibes.pptx`](submission/Secure-Vibes.pptx) | Pitch deck |

All demo material uses the fictional site **MyAwesomeVibeCodedWebsite.com**.

## Quick start

**You need:** [Node.js](https://nodejs.org) 22.12 or newer and [FFmpeg](https://ffmpeg.org) on your PATH (`brew install ffmpeg` on macOS, `sudo apt install ffmpeg` on Ubuntu).

```bash
git clone https://github.com/Salem-1/Secure-vibes.git
cd Secure-vibes
npm install
cp .env.example .env      # optional: add your OpenRouter key for the Gemma 4 brief
npm start
```

Open **http://localhost:3000**.

**Try it without scanning anything:** type `MyAwesomeVibeCodedWebsite.com`, tick the consent box, and press the arrow. Demo mode plays back a built-in sample report (`assets/demo-report.json`), so you can see the whole flow, video included, in under a minute.

**Scan a real site:** enter a domain you own or are allowed to scan, tick the consent box, and press the arrow. The scan takes about 15 seconds and the video about 30.

The first video render downloads a headless Chrome for HyperFrames, so it takes a little longer.

## Configuration

Everything in `.env` is optional. Without a key the scan, report and video still work; only the Gemma 4 brief is skipped.

| Variable | What it does |
| --- | --- |
| `OPENROUTER_API_KEY` | Turns on the Gemma 4 executive brief. Get a key at [openrouter.ai/keys](https://openrouter.ai/keys). |
| `OPENROUTER_MODEL` | Gemma 4 model to use. Default `google/gemma-4-31b-it`; `google/gemma-4-31b-it:free` uses the free tier. |
| `GEMINI_API_KEY` | Only for the optional demo voiceover (Gemini Flash TTS). Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). |
| `GEMINI_TTS_MODEL` | Voiceover model. Default `gemini-2.5-flash-preview-tts`. |
| `DEMO_DOMAIN` | The domain that triggers demo mode. Default `MyAwesomeVibeCodedWebsite.com`. |
| `PORT` | Port for the web app. Default `3000`. |

`.env` is git-ignored. Never commit real keys.

## What it checks

11 passive checks, about 15 seconds in total:

1. **Encryption**: certificate validity, trust and expiry
2. **Outdated encryption**: TLS 1.0 / 1.1 still accepted
3. **HTTPS enforcement**: http:// redirects to https://
4. **Website hardening**: HSTS, CSP, clickjacking, nosniff, referrer and permissions headers; cookie flags; software version leaks
5. **Email spoofing**: SPF and DMARC, which decide whether someone can email your users as you
6. **Threat intelligence**: 4 DNS blocklists (Cloudflare, Quad9, CleanBrowsing, AdGuard)
7. **Exposed services**: 15 risky ports (databases, RDP, FTP, SSH, Telnet, Redis, MongoDB and more)
8. **Leaked files**: `.git`, `.env`, server-status, phpinfo, WordPress user list, XML-RPC
9. **Outdated software**: vulnerable jQuery, AngularJS or Bootstrap; published CMS versions
10. **Domain health**: registration expiry, transfer lock, DNSSEC, CAA, security.txt
11. **Attack surface**: public subdomains from certificate-transparency logs (dev, staging and admin hosts flagged) and third-party scripts

Every check only does what a normal visitor, mail server or DNS client does. The app refuses to scan unless the consent box is ticked. **Only scan domains you own or have permission to test.**

## How it works

| Piece | File | Tech |
| --- | --- | --- |
| Web app and API | `server.js`, `public/index.html` | Express 5; live progress over Server-Sent Events |
| Scanner | `lib/scanner.js` | Node.js; checks modelled on [web-check](https://github.com/Lissy93/web-check) |
| AI brief | `lib/ai.js` | Gemma 4 through OpenRouter |
| Briefing video | `lib/video.js` | One [HyperFrames](https://github.com/heygen-com/hyperframes) composition per scan, animated with GSAP |
| Demo mode | `lib/demo.js`, `assets/demo-report.json` | Plays back the sample report |

**API**

- `GET /api/scan?domain=<domain>&consent=1`: Server-Sent Events stream of `step` events, then a `result` event with `{ id, report }`. Rendering the video starts right after.
- `GET /api/video/<id>`: video status `{ state, pct, url }`.
- `POST /api/subscribe`: `{ email, domain, plan }`, saved to `jobs/subscribers.json`.

Scan results and videos are written to `jobs/`, which is git-ignored.

## Remaking the demo material

With the server running:

```bash
npm run demo:record      # records the walkthrough with Chrome (set CHROME_PATH if Chrome isn't in /Applications)
npm run demo:edit        # cuts it to the key moments with music → submission/demo.mp4
npm run deck             # rebuilds the pitch deck (needs: pip install python-pptx)
```

To add the Gemini Flash voiceover, set `GEMINI_API_KEY`, then run `npm run demo:voice` and `npm run demo:edit:voice`. The script is in `submission/promo-script.json`.

## Credits

Built on open source. See [CREDITS.md](CREDITS.md) for every project, model, font and data source used.
