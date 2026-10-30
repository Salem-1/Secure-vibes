# Builds the Secure Vibes pitch deck: python3 submission/make_deck.py (run from threatscan/)
import json, glob, os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

NAVY = RGBColor(0x06, 0x12, 0x24); TEAL = RGBColor(0x14, 0xb8, 0xa6); WHITE = RGBColor(0xff, 0xff, 0xff)
DIM = RGBColor(0xa8, 0xb3, 0xc7); PANEL = RGBColor(0x0c, 0x1f, 0x38)
SEVC = {'critical': RGBColor(0xff, 0x3b, 0x5c), 'high': RGBColor(0xff, 0x8a, 0x3d), 'medium': RGBColor(0xff, 0xc9, 0x3d),
        'low': RGBColor(0x5f, 0xb8, 0xff), 'info': DIM, 'pass': RGBColor(0x2e, 0xe5, 0x9d)}

REPORT = 'assets/demo-report.json'  # fictional sample site
rep = json.load(open(REPORT)) if os.path.exists(REPORT) else None
frames = sorted(glob.glob('submission/frame_*.png'), key=lambda p: float(p.split('_')[-1][:-4]))[:3]

prs = Presentation(); prs.slide_width = Inches(13.333); prs.slide_height = Inches(7.5)
blank = prs.slide_layouts[6]


def slide():
    s = prs.slides.add_slide(blank)
    s.background.fill.solid(); s.background.fill.fore_color.rgb = NAVY
    bar = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, Inches(0.08))
    bar.fill.solid(); bar.fill.fore_color.rgb = TEAL; bar.line.fill.background()
    tb = s.shapes.add_textbox(Inches(0.6), Inches(0.3), Inches(4), Inches(0.5)).text_frame
    p = tb.paragraphs[0]
    for t, c in (('Secure', WHITE), ('Vibes', TEAL)):
        r = p.add_run(); r.text = t; r.font.size = Pt(20); r.font.bold = True; r.font.color.rgb = c
    return s


def text(s, x, y, w, h, lines, size=20, color=WHITE, bold=False, space=6):
    tf = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)).text_frame
    tf.word_wrap = True
    for i, ln in enumerate(lines if isinstance(lines, list) else [lines]):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        if isinstance(ln, tuple): ln, sz, col, b = ln
        else: sz, col, b = size, color, bold
        r = p.add_run(); r.text = ln; r.font.size = Pt(sz); r.font.color.rgb = col; r.font.bold = b
        p.space_after = Pt(space)
    return tf


def title(s, t, sub=None):
    text(s, 0.6, 1.0, 12, 1.2, t, 40, WHITE, True)
    if sub: text(s, 0.6, 1.9, 12, 0.8, sub, 20, DIM)


def card(s, x, y, w, h, head, body, accent=TEAL, hs=20, bs=15):
    b = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    b.adjustments[0] = 0.08; b.fill.solid(); b.fill.fore_color.rgb = PANEL; b.line.color.rgb = accent; b.line.width = Pt(1.5)
    text(s, x + 0.25, y + 0.2, w - 0.5, h - 0.3, [(head, hs, accent, True), (body, bs, WHITE, False)])


# 1 Title
s = slide()
text(s, 0.6, 2.2, 12, 1.5, [('You vibe-coded it.', 60, WHITE, True), ('Is it secure?', 60, TEAL, True)], space=0)
text(s, 0.6, 4.6, 12, 1, 'Secure Vibes: see what attackers see in 60 seconds', 26, DIM)
text(s, 0.6, 6.4, 12, 0.6, 'For founders shipping with Cursor · Lovable · Bolt · Replit · Claude Code', 16, TEAL)

# 2 Hook
s = slide(); title(s, 'You shipped fast. Attackers scan faster.', 'Bots find and scan every new site within hours of launch. No one is "too small".')
for i, (h, b) in enumerate([
    ('Open ports', 'AI scaffolds leave SSH, FTP and databases reachable from the internet.'),
    ('Missing headers', 'No CSP, no HSTS: one bad script and your users\' data walks out.'),
    ('Leaked .env files', 'API keys and DB passwords one URL away from anyone.'),
    ('No email protection', 'Without SPF/DMARC, anyone can email your customers as you.')]):
    card(s, 0.6 + i * 3.1, 3.2, 2.9, 3.2, h, b, SEVC['high'] if i % 2 else SEVC['critical'])

# 3 How bad
s = slide(); title(s, 'How bad can it go?', 'Real outcomes we see when vibe-coded apps hit production.')
for i, (h, b, c) in enumerate([
    ('Leaked API keys', '→ a surprise $10k cloud or OpenAI bill by Monday.', 'critical'),
    ('Spoofed email from your domain', '→ your customers get phished in your name.', 'high'),
    ('Exposed database', '→ a data-breach headline instead of a launch headline.', 'critical'),
    ('Site blocklisted', '→ browsers block you. Traffic drops to zero.', 'high')]):
    card(s, 0.6 + (i % 2) * 6.15, 2.9 + (i // 2) * 2.1, 5.95, 1.85, h, b, SEVC[c], 22, 17)

# 4 Checks
s = slide(); title(s, 'Paste your URL. Get the truth.', '11 passive checks in ~15 seconds. Read-only, with the owner\'s consent.')
checks = ['Encryption certificate', 'Outdated TLS (1.0/1.1)', 'HTTP → HTTPS redirect', 'Security headers', 'Email spoofing (SPF / DMARC)',
          'Threat-intel blocklists (4)', '15 risky ports', 'Leaked files (.git / .env)', 'Outdated libraries', 'Domain health', 'Attack surface & subdomains']
text(s, 0.8, 2.8, 6, 4.5, ['✓  ' + c for c in checks[:6]], 20)
text(s, 6.9, 2.8, 6, 4.5, ['✓  ' + c for c in checks[6:]] + [('→ a plain-English report, not a wall of CVEs', 20, TEAL, True)], 20)

# 5 Gemma 4
s = slide(); title(s, "We don't just scare you. We tell you how to fix it.", 'Gemma 4 (google/gemma-4-31b-it via OpenRouter) turns raw findings into your brief.')
ai = (rep or {}).get('ai') or {}
card(s, 0.6, 2.8, 7.4, 4.2, ai.get('headline', 'AI executive brief'), ai.get('summary', ''), TEAL, 22, 16)
acts = ai.get('actions', [])
card(s, 8.2, 2.8, 4.5, 2.6, 'Top 3 fixes', '\n'.join(f'{i+1}. {a}' for i, a in enumerate(acts)), SEVC['pass'], 20, 15)
card(s, 8.2, 5.55, 4.5, 1.45, 'For your investors', f'"{ai.get("boardLine", "")}"', SEVC['medium'], 16, 13)

# 6 Real scan
s = slide()
exp = 100 - rep['summary']['score'] if rep else '?'
title(s, f'Sample scan: MyAwesomeVibeCodedWebsite.com · {exp}/100 exposure', 'A typical vibe-coded site · 7 issues found from the outside, zero access needed.')
top = [f for f in (rep or {}).get('findings', []) if f['severity'] not in ('pass', 'info')][:4]
for i, f in enumerate(top):
    card(s, 0.6 + (i % 2) * 6.15, 2.8 + (i // 2) * 2.15, 5.95, 1.95, f"{f['severity'].upper()} · {f['title']}", 'Fix: ' + f['fix'], SEVC[f['severity']], 17, 15)

# 7 Video
s = slide(); title(s, 'Your personal security video', 'Every scan renders a 32-second briefing you can share with your co-founder or investors.')
for i, fp in enumerate(frames):
    s.shapes.add_picture(fp, Inches(0.6 + i * 4.15), Inches(2.9), width=Inches(3.95))
text(s, 0.6, 5.5, 12, 1, 'Hook  →  Issues found  →  Grade  →  Top risks  →  Attack surface  →  Call to action', 20, TEAL, True)

# 8 Built with
s = slide(); title(s, 'Built with', 'Open source all the way down.')
for i, (h, b) in enumerate([
    ('Scanner', 'Checks modelled on web-check (MIT). Node.js, ~15 s per scan.'),
    ('AI brief', 'Gemma 4 via OpenRouter writes the CEO-friendly summary and fixes.'),
    ('Video', 'HyperFrames renders HTML + GSAP to MP4. ~30 s per video.'),
    ('Web app', 'Node / Express, live progress over Server-Sent Events.')]):
    card(s, 0.6 + i * 3.1, 2.9, 2.9, 3.0, h, b)

# 9 CTA
s = slide()
text(s, 0.6, 1.8, 12, 1.2, 'Scan your vibe today.', 54, WHITE, True)
text(s, 0.6, 3.2, 12, 2, [('Free scan  →  fix list  →  Secure Vibes monthly', 26, TEAL, True),
                         ('Continuous monitoring + fixes you can paste straight into your AI coding tool.', 22, WHITE, False)])
text(s, 0.6, 6.2, 12, 0.6, 'github.com/Salem-1/Secure-vibes', 16, DIM)

prs.save('submission/Secure-Vibes.pptx')
old = 'submission/CysuiteONE-Exposure-Check.pptx'
if os.path.exists(old): os.remove(old)
print('saved submission/Secure-Vibes.pptx', len(prs.slides), 'slides, frames:', len(frames), 'ai:', bool(ai))
