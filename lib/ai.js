// Gemma 4 (via OpenRouter) turns raw scan findings into a CEO-ready executive brief.
const MODEL = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it';

export async function aiBrief(report) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key.startsWith('your-')) return { skipped: 'No OPENROUTER_API_KEY set' };
  const issues = report.findings
    .filter((f) => f.severity !== 'info')
    .map((f) => `- [${f.severity}] ${f.title}: ${f.impact}`)
    .join('\n');
  const prompt = `You are CysuiteONE's virtual Cyber & Privacy Officer. A consented, passive external scan of ${report.target.host} found:
${issues}
Exposure score: ${100 - report.summary.score}/100 (higher = more exposed).

Write for a non-technical CEO. Return ONLY JSON:
{"headline": "<one punchy sentence, max 14 words>",
 "summary": "<3 sentences: what an attacker could do, business impact in money/reputation terms, reassurance it is fixable>",
 "actions": ["<top 3 actions, each max 12 words, plain English>"],
 "boardLine": "<one sentence the CEO can say to the board or investors>"}`;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(25000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'CysuiteONE Exposure Check' },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.4, response_format: { type: 'json_object' } }),
    });
    const j = await res.json();
    if (!res.ok) return { error: j.error?.message || `HTTP ${res.status}`, model: MODEL };
    const text = j.choices?.[0]?.message?.content || '';
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    return { ...json, model: MODEL };
  } catch (e) {
    return { error: e.message, model: MODEL };
  }
}
