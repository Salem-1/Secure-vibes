# Credits

Secure Vibes is built on the work of these open-source projects, models and public services. Thank you to everyone who made them.

## Design

- **CysuiteONE**: the website and report UI (layout, navy and teal color scheme, the home-page hero panels, and the "Step 1 · Domain check" report with its exposure score, 9-domain assessment grid and findings list) are adapted from CysuiteONE's own website and exposure-check report. CysuiteONE is the company this hackathon project was built for. All CysuiteONE design rights remain with CysuiteONE.

## Open-source projects

| Project | What we use it for | License |
| --- | --- | --- |
| [web-check](https://github.com/Lissy93/web-check) by Alicia Sykes ([@Lissy93](https://github.com/lissy93)) | The scanner's set of checks (TLS, headers, DNS, email, ports, security.txt, blocklists) is modelled on web-check's checks. `lib/scanner.js` is our own lighter reimplementation of them. | MIT |
| [HyperFrames](https://github.com/heygen-com/hyperframes) by HeyGen | Renders each scan's HTML composition into the personal MP4 briefing video (`lib/video.js`) | Apache-2.0 |
| [GSAP](https://gsap.com) by GreenSock / Webflow | Animation timeline in the briefing video. A copy is bundled at `assets/gsap.min.js` | [GSAP Standard "no charge" license](https://gsap.com/standard-license) |
| [Express](https://expressjs.com) | Web server and API (`server.js`) | MIT |
| [Puppeteer](https://pptr.dev) (puppeteer-core) | Records the demo walkthrough (`submission/record.mjs`) | Apache-2.0 |
| [python-pptx](https://github.com/scanny/python-pptx) | Builds the pitch deck (`submission/make_deck.py`) | MIT |
| [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by hexgrad, via [kokoro-js](https://github.com/hexgrad/kokoro) | The demo video's voiceover, generated locally (`submission/voiceover-local.mjs`) | Apache-2.0 |
| [FFmpeg](https://ffmpeg.org) | Video encoding, demo editing and the generated ambient soundtrack (`assets/music.wav`) | LGPL / GPL |
| [Node.js](https://nodejs.org) | Runtime | MIT |

## AI model

| Model | What we use it for |
| --- | --- |
| [Gemma 4](https://ai.google.dev/gemma) by Google DeepMind (`google/gemma-4-31b-it`), served through [OpenRouter](https://openrouter.ai) | Writes the AI executive brief for every scan (`lib/ai.js`), subject to the Gemma license terms |

## Fonts

- [Inter](https://rsms.me/inter/) by Rasmus Andersson: SIL Open Font License 1.1
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) by JetBrains: SIL Open Font License 1.1

## Public data sources used during a scan

- [crt.sh](https://crt.sh) by Sectigo: certificate-transparency logs, used to find subdomains
- [rdap.org](https://rdap.org): domain registration data (RDAP)
- [Google Public DNS](https://developers.google.com/speed/public-dns) (DNS-over-HTTPS): DNSSEC lookups
- Threat-intelligence DNS resolvers: [Cloudflare 1.1.1.2](https://developers.cloudflare.com/1.1.1.1/setup/#1111-for-families), [Quad9](https://quad9.net), [CleanBrowsing](https://cleanbrowsing.org), [AdGuard DNS](https://adguard-dns.io)

## Inspiration and references for the video work

We studied these repositories while designing the briefing video. No code from them is included here.

- [JohnHeibel/PDoomVideo](https://github.com/JohnHeibel/PDoomVideo)
- [JohnHeibel/ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase)
- [buildwithhanif/claude-animation-skill](https://github.com/buildwithhanif/claude-animation-skill)
- [WinterArc21/Battle-of-Austerlitz-Film](https://github.com/WinterArc21/Battle-of-Austerlitz-Film)
- [guanmo-ai/awesome-ai-motion](https://github.com/guanmo-ai/awesome-ai-motion)
- [athemeroy/awesome-claude-5-5-videos](https://github.com/athemeroy/awesome-claude-5-5-videos)

Built with help from [Claude Code](https://claude.com/claude-code).
