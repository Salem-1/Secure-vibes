// Quick, non-intrusive external exposure scan.
// Check set modelled on Lissy93/web-check (MIT): TLS, headers, DNS/email, ports,
// security.txt, blocklists, plus a few "low-hanging fruit" probes.
// Every check only does what a normal visitor / mail server / DNS client does.
import tls from 'node:tls';
import net from 'node:net';
import dns from 'node:dns/promises';
import { Resolver } from 'node:dns/promises';

const UA = 'Mozilla/5.0 (compatible; SecureVibesQuickScan/1.0; consented-scan)';
const T = (ms) => AbortSignal.timeout(ms);

export function normalizeTarget(input) {
  let s = String(input || '').trim();
  if (!s) throw new Error('Please enter a domain');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  const u = new URL(s);
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) throw new Error('Please enter a public domain like acme.com');
  if (/^(localhost|.*\.local|.*\.internal)$/.test(host)) throw new Error('Private hosts cannot be scanned');
  const apex = host.replace(/^www\./, '');
  return { host, apex, url: `https://${host}/` };
}

async function get(url, opts = {}) {
  const res = await fetch(url, {
    redirect: opts.redirect || 'follow',
    headers: { 'user-agent': UA, ...(opts.headers || {}) },
    signal: T(opts.timeout || 8000),
  });
  const body = opts.body === false ? '' : (await res.text()).slice(0, opts.max || 400000);
  return { res, body };
}

async function doh(name, type) {
  const { res } = { res: await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, { signal: T(6000) }) };
  return res.json();
}

// ---------------- individual checks ----------------

async function checkTLS({ host }) {
  return new Promise((resolve) => {
    const sock = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 7000 }, () => {
      const c = sock.getPeerCertificate();
      const out = {
        ok: true,
        authorized: sock.authorized,
        authError: sock.authorizationError || null,
        protocol: sock.getProtocol(),
        cipher: sock.getCipher()?.name,
        issuer: c?.issuer?.O || c?.issuer?.CN,
        subject: c?.subject?.CN,
        validTo: c?.valid_to,
        daysLeft: c?.valid_to ? Math.round((new Date(c.valid_to) - Date.now()) / 864e5) : null,
        altNames: (c?.subjectaltname || '').split(',').map((s) => s.trim().replace(/^DNS:/, '')).filter(Boolean).slice(0, 50),
      };
      sock.end();
      resolve(out);
    });
    sock.on('error', (e) => resolve({ ok: false, error: e.message }));
    sock.on('timeout', () => { sock.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

async function checkOldTLS({ host }) {
  // Does the server still accept TLS 1.0 / 1.1?
  const tryV = (v) => new Promise((resolve) => {
    try {
      const s = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, minVersion: v, maxVersion: v, timeout: 5000, ciphers: 'DEFAULT:@SECLEVEL=0' }, () => { s.end(); resolve(true); });
      s.on('error', () => resolve(false));
      s.on('timeout', () => { s.destroy(); resolve(false); });
    } catch { resolve(false); }
  });
  return { tls10: await tryV('TLSv1'), tls11: await tryV('TLSv1.1') };
}

async function checkHttpRedirect({ host }) {
  try {
    const { res } = await get(`http://${host}/`, { redirect: 'manual', body: false, timeout: 6000 });
    const loc = res.headers.get('location') || '';
    return { status: res.status, redirectsToHttps: res.status >= 300 && res.status < 400 && /^https:/i.test(loc), location: loc };
  } catch (e) { return { error: e.message }; }
}

async function checkPage({ url }) {
  const { res, body } = await get(url, { timeout: 10000 });
  const h = Object.fromEntries(res.headers.entries());
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const generator = (body.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i) || [])[1] || null;
  const title = (body.match(/<title[^>]*>([^<]{0,120})/i) || [])[1]?.trim() || null;
  const scripts = [...body.matchAll(/<script[^>]+src=["']([^"']+)/gi)].map((m) => m[1]);
  const libs = [];
  for (const s of scripts) {
    let m;
    if ((m = s.match(/jquery[.-]?(\d+\.\d+(?:\.\d+)?)(?:\.min)?\.js/i)) || (m = s.match(/jquery\/(\d+\.\d+(?:\.\d+)?)\//i)) || (m = s.match(/jquery\.js\?ver=(\d+\.\d+(?:\.\d+)?)/i))) libs.push({ name: 'jQuery', version: m[1] });
    if ((m = s.match(/bootstrap[@/-](\d+\.\d+(?:\.\d+)?)/i))) libs.push({ name: 'Bootstrap', version: m[1] });
    if ((m = s.match(/angular(?:\.min)?\.js.*?(1\.\d+\.\d+)|angularjs\/(1\.\d+\.\d+)/i))) libs.push({ name: 'AngularJS', version: m[1] || m[2] });
  }
  const mixed = [...body.matchAll(/(?:src|href)=["']http:\/\/[^"']+\.(?:js|css)["']/gi)].length;
  const thirdPartyScripts = new Set(scripts.map((s) => { try { return new URL(s, url).hostname; } catch { return null; } }).filter((x) => x && !x.endsWith(new URL(url).hostname.replace(/^www\./, ''))));
  const wp = /wp-content|wp-includes/i.test(body);
  const forms = (body.match(/<form/gi) || []).length;
  const pwField = /type=["']password["']/i.test(body);
  return { status: res.status, finalUrl: res.url, headers: h, cookies, generator, title, libs, mixed, thirdParty: [...thirdPartyScripts].slice(0, 30), wordpress: wp, forms, pwField, bytes: body.length };
}

async function checkDNS({ apex }) {
  const r = {};
  const safe = async (k, fn) => { try { r[k] = await fn(); } catch { r[k] = null; } };
  await Promise.all([
    safe('a', () => dns.resolve4(apex)),
    safe('aaaa', () => dns.resolve6(apex)),
    safe('mx', () => dns.resolveMx(apex)),
    safe('ns', () => dns.resolveNs(apex)),
    safe('txt', async () => (await dns.resolveTxt(apex)).map((x) => x.join(''))),
    safe('dmarc', async () => (await dns.resolveTxt('_dmarc.' + apex)).map((x) => x.join('')).find((x) => /^v=DMARC1/i.test(x)) || null),
    safe('caa', () => dns.resolveCaa(apex)),
    safe('ds', async () => (await doh(apex, 'DS')).Answer?.length > 0),
  ]);
  r.spf = (r.txt || []).find((x) => /^v=spf1/i.test(x)) || null;
  r.dmarcPolicy = r.dmarc ? ((r.dmarc.match(/p=(\w+)/i) || [])[1] || 'none').toLowerCase() : null;
  return r;
}

async function checkReputation({ apex }) {
  // Filtering resolvers return 0.0.0.0 / NXDOMAIN for domains on their threat feeds.
  const lists = [
    { name: 'Cloudflare Malware Shield', server: '1.1.1.2' },
    { name: 'Quad9 Threat Blocking', server: '9.9.9.9' },
    { name: 'CleanBrowsing Security', server: '185.228.168.9' },
    { name: 'AdGuard DNS', server: '94.140.14.14' },
  ];
  let real = null;
  try { real = await dns.resolve4(apex); } catch { /* no A record */ }
  const out = await Promise.all(lists.map(async (l) => {
    const res = new Resolver({ timeout: 3000, tries: 1 });
    res.setServers([l.server]);
    try {
      const a = await res.resolve4(apex);
      return { ...l, blocked: a.some((ip) => ip === '0.0.0.0' || ip.startsWith('146.112.61.')) };
    } catch (e) {
      return { ...l, blocked: real && e.code === 'ENOTFOUND' ? true : false, note: e.code };
    }
  }));
  return out;
}

const PORTS = [
  { port: 21, svc: 'FTP (file transfer)', risk: 'high' },
  { port: 22, svc: 'SSH (remote admin)', risk: 'medium' },
  { port: 23, svc: 'Telnet (unencrypted admin)', risk: 'critical' },
  { port: 25, svc: 'SMTP (mail)', risk: 'info' },
  { port: 445, svc: 'Windows file sharing (SMB)', risk: 'critical' },
  { port: 1433, svc: 'Microsoft SQL database', risk: 'critical' },
  { port: 3306, svc: 'MySQL database', risk: 'critical' },
  { port: 3389, svc: 'Remote Desktop (RDP)', risk: 'critical' },
  { port: 5432, svc: 'PostgreSQL database', risk: 'critical' },
  { port: 5900, svc: 'VNC remote screen', risk: 'critical' },
  { port: 6379, svc: 'Redis cache', risk: 'critical' },
  { port: 8080, svc: 'Alternate web / admin panel', risk: 'low' },
  { port: 8443, svc: 'Alternate HTTPS / admin panel', risk: 'low' },
  { port: 9200, svc: 'Elasticsearch', risk: 'critical' },
  { port: 27017, svc: 'MongoDB database', risk: 'critical' },
];

async function checkPorts({ host }) {
  let ip;
  try { ip = (await dns.resolve4(host))[0]; } catch { return { ip: null, open: [] }; }
  const probe = (p) => new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(2000);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(false));
    s.connect(p.port, ip);
  });
  const res = await Promise.all(PORTS.map(async (p) => ({ ...p, open: await probe(p) })));
  // Some CDNs/firewalls accept every port (tarpit). If almost all are "open", ignore.
  const open = res.filter((p) => p.open);
  return { ip, open: open.length > 10 ? [] : open, tarpit: open.length > 10, checked: PORTS.length };
}

const SENSITIVE = [
  { path: '/.git/HEAD', label: 'Source code repository (.git)', test: (b) => /^ref: refs\//.test(b), sev: 'critical' },
  { path: '/.env', label: 'Environment file with secrets (.env)', test: (b) => /^[A-Z0-9_]+=.+/m.test(b) && !/<html/i.test(b), sev: 'critical' },
  { path: '/.DS_Store', label: 'Mac folder index (.DS_Store)', test: (b) => b.startsWith('\u0000\u0000\u0000\u0001Bud1'), sev: 'medium' },
  { path: '/server-status', label: 'Apache live server status page', test: (b) => /Apache Server Status/i.test(b), sev: 'high' },
  { path: '/phpinfo.php', label: 'PHP configuration dump (phpinfo)', test: (b) => /phpinfo\(\)|PHP Version/i.test(b) && /<table/i.test(b), sev: 'high' },
  { path: '/wp-json/wp/v2/users', label: 'WordPress user list (usernames for login attacks)', test: (b) => /^\s*\[\s*\{"id":\d+,"name"/.test(b), sev: 'medium' },
  { path: '/xmlrpc.php', label: 'WordPress XML-RPC (password brute-force amplifier)', test: (b, r) => r.status === 405 || /XML-RPC server accepts POST requests only/i.test(b), sev: 'low' },
];

async function checkExposedFiles({ url }) {
  const base = new URL(url).origin;
  const out = await Promise.all(SENSITIVE.map(async (f) => {
    try {
      const { res, body } = await get(base + f.path, { redirect: 'manual', max: 20000, timeout: 6000 });
      return { ...f, test: undefined, found: res.status < 300 || f.path === '/xmlrpc.php' ? f.test(body, res) : false };
    } catch { return { ...f, test: undefined, found: false }; }
  }));
  return out;
}

async function checkSecurityTxt({ url }) {
  const base = new URL(url).origin;
  for (const p of ['/.well-known/security.txt', '/security.txt']) {
    try {
      const { res, body } = await get(base + p, { max: 10000, timeout: 5000 });
      if (res.ok && /contact:/i.test(body) && !/<html/i.test(body)) return { present: true, path: p };
    } catch { /* ignore */ }
  }
  return { present: false };
}

async function checkRDAP({ apex }) {
  try {
    const res = await fetch(`https://rdap.org/domain/${apex}`, { signal: T(8000), headers: { accept: 'application/rdap+json' } });
    const j = await res.json();
    const ev = (a) => j.events?.find((e) => e.eventAction === a)?.eventDate || null;
    const registrar = j.entities?.find((e) => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find((v) => v[0] === 'fn')?.[3] || null;
    const exp = ev('expiration');
    return { created: ev('registration'), expires: exp, daysLeft: exp ? Math.round((new Date(exp) - Date.now()) / 864e5) : null, registrar, locked: (j.status || []).some((s) => /transfer prohibited/i.test(s)) };
  } catch (e) { return { error: e.message }; }
}

async function checkSubdomains({ apex }, tlsInfo) {
  const set = new Set((tlsInfo?.altNames || []).filter((n) => n.endsWith(apex) && !n.startsWith('*')));
  try {
    const res = await fetch(`https://crt.sh/?q=%25.${apex}&output=json`, { signal: T(12000), headers: { 'user-agent': UA } });
    const j = await res.json();
    for (const row of j) for (const n of String(row.name_value).split('\n')) {
      const x = n.trim().toLowerCase();
      if (x.endsWith(apex) && !x.includes('*')) set.add(x);
    }
  } catch { /* crt.sh is often slow, fall back to certificate names */ }
  set.delete(apex);
  const all = [...set].sort();
  const juicy = all.filter((s) => /(^|\.)(dev|test|staging|stage|uat|qa|admin|vpn|jenkins|gitlab|git|jira|old|backup|beta|internal|db|ftp|cpanel|grafana|kibana)[.-]/.test(s));
  return { count: all.length, sample: all.slice(0, 60), sensitive: juicy.slice(0, 20) };
}

// ---------------- findings & scoring ----------------

const SEV_WEIGHT = { critical: 25, high: 12, medium: 6, low: 2, info: 0, pass: 0 };

function versionLt(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) < (pb[i] || 0)) return true; if ((pa[i] || 0) > (pb[i] || 0)) return false; }
  return false;
}

export function buildFindings(d) {
  const F = [];
  const add = (category, severity, title, impact, detail, fix) => F.push({ category, severity, title, impact, detail, fix });

  // Encryption
  const t = d.tls || {};
  if (!t.ok) add('Encryption', 'critical', 'No working HTTPS', 'Visitors\' logins and payment details can be read by anyone on the same Wi-Fi.', t.error, 'Install a free TLS certificate (e.g. Let\'s Encrypt) and serve the site over HTTPS.');
  else {
    if (!t.authorized) add('Encryption', 'critical', 'Browser-untrusted certificate', 'Customers see a full-screen "Not secure" warning, and most of them leave.', t.authError, 'Replace the certificate with one from a trusted authority covering every hostname.');
    if (t.daysLeft != null && t.daysLeft < 0) add('Encryption', 'critical', 'Certificate has expired', 'Your site is effectively offline for security-conscious visitors.', `Expired ${-t.daysLeft} days ago`, 'Renew the certificate and turn on auto-renewal.');
    else if (t.daysLeft != null && t.daysLeft < 21) add('Encryption', 'medium', `Certificate expires in ${t.daysLeft} days`, 'If renewal fails, your site goes dark with a security warning.', `Valid until ${t.validTo}`, 'Confirm auto-renewal is working.');
    else add('Encryption', 'pass', 'Valid HTTPS certificate', 'Traffic between customers and your site is encrypted.', `${t.issuer || ''} · ${t.protocol} · ${t.daysLeft} days left`, '');
  }
  if (d.oldTls?.tls10 || d.oldTls?.tls11) add('Encryption', 'medium', 'Outdated encryption (TLS 1.0/1.1) still accepted', 'Fails PCI-DSS compliance and allows downgrade attacks on old devices.', `TLS 1.0: ${d.oldTls.tls10 ? 'on' : 'off'} · TLS 1.1: ${d.oldTls.tls11 ? 'on' : 'off'}`, 'Disable TLS 1.0 and 1.1; keep TLS 1.2 and 1.3.');
  if (d.redirect && !d.redirect.error && !d.redirect.redirectsToHttps) add('Encryption', 'medium', 'Plain HTTP is not forced to HTTPS', 'Someone typing your address can be served an unencrypted, tamperable page.', `http:// returns ${d.redirect.status}`, 'Redirect all http:// traffic to https:// with a 301.');

  // Website hardening (headers)
  const h = d.page?.headers || {};
  if (d.page) {
    const hdr = [
      ['strict-transport-security', 'medium', 'No HSTS (HTTPS can be stripped)', 'An attacker on public Wi-Fi can silently downgrade visitors to an unencrypted connection.', 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains'],
      ['content-security-policy', 'medium', 'No Content-Security-Policy', 'If any script on your site is compromised, nothing stops it from stealing customer data (the Magecart / British Airways attack pattern).', 'Define a Content-Security-Policy listing the script sources you trust.'],
      ['x-frame-options', 'low', 'Site can be framed by other websites (clickjacking)', 'A fake site can overlay your real pages and trick users into clicking "Confirm".', 'Add X-Frame-Options: DENY or CSP frame-ancestors \'self\'.'],
      ['x-content-type-options', 'low', 'Missing X-Content-Type-Options', 'Browsers may run uploaded files as code.', 'Add X-Content-Type-Options: nosniff.'],
      ['referrer-policy', 'low', 'No Referrer-Policy', 'Private URLs (reset links, internal IDs) can leak to third parties.', 'Add Referrer-Policy: strict-origin-when-cross-origin.'],
      ['permissions-policy', 'info', 'No Permissions-Policy', 'Embedded third-party content can request camera, mic or location.', 'Add a Permissions-Policy that disables features you do not use.'],
    ];
    let missing = 0;
    for (const [k, sev, title, impact, fix] of hdr) {
      const present = k === 'x-frame-options' ? (h[k] || /frame-ancestors/i.test(h['content-security-policy'] || '')) : h[k];
      if (!present) { missing++; add('Website hardening', sev, title, impact, `Header "${k}" not sent`, fix); }
    }
    if (missing === 0) add('Website hardening', 'pass', 'All key security headers present', 'Browsers are told to enforce strong protections on your site.', '', '');
    const leak = [h['server'], h['x-powered-by'], h['x-aspnet-version']].filter((v) => v && /\d/.test(v));
    if (leak.length) add('Website hardening', 'low', 'Software versions advertised publicly', 'Attackers can instantly match your exact versions against known exploits.', leak.join(' · '), 'Hide version numbers in Server / X-Powered-By headers.');
    const badCookies = (d.page.cookies || []).filter((c) => !/;\s*secure/i.test(c) || !/;\s*httponly/i.test(c));
    if (badCookies.length) add('Website hardening', 'low', `${badCookies.length} cookie(s) missing Secure/HttpOnly flags`, 'Session cookies can be stolen by malicious scripts or over insecure connections.', badCookies.map((c) => c.split('=')[0]).slice(0, 5).join(', '), 'Set Secure, HttpOnly and SameSite on all session cookies.');
    if (d.page.mixed > 0) add('Website hardening', 'medium', `${d.page.mixed} script/style file(s) loaded over plain HTTP`, 'Those files can be swapped in transit to inject malicious code into your site.', '', 'Load every resource over https://.');
    for (const lib of d.page.libs || []) {
      if (lib.name === 'jQuery' && versionLt(lib.version, '3.5.0')) add('Outdated software', 'high', `jQuery ${lib.version} has known vulnerabilities`, 'Publicly documented cross-site-scripting flaws (CVE-2020-11022/11023) can be used to hijack user sessions.', `Loaded jQuery ${lib.version}`, 'Upgrade jQuery to 3.7+.');
      if (lib.name === 'AngularJS') add('Outdated software', 'high', `AngularJS ${lib.version} is end-of-life`, 'No security patches since January 2022; known sandbox escapes exist.', '', 'Migrate off AngularJS 1.x.');
      if (lib.name === 'Bootstrap' && versionLt(lib.version, '3.4.1')) add('Outdated software', 'medium', `Bootstrap ${lib.version} has known XSS flaws`, 'Known cross-site-scripting vulnerabilities in components.', '', 'Upgrade Bootstrap.');
    }
    if (d.page.generator && /\d/.test(d.page.generator)) add('Outdated software', 'low', `CMS version published: ${d.page.generator}`, 'Bots scan the internet for exactly this string the day a new exploit drops.', '', 'Remove the generator meta tag and keep the CMS updated.');
    if ((d.page.thirdParty || []).length > 8) add('Supply chain', 'low', `${d.page.thirdParty.length} third-party script domains on your homepage`, 'Each third party can run code on your site. One compromised vendor = your breach.', d.page.thirdParty.slice(0, 8).join(', '), 'Review vendors; add Subresource Integrity and a CSP.');
  }

  // Email
  const n = d.dns || {};
  if (n.mx?.length || n.spf || n.dmarc) {
    if (!n.spf) add('Email security', 'high', 'No SPF record: anyone can send email as your domain', 'Criminals can email your customers or finance team "from" your CEO. This is the #1 cause of invoice fraud.', 'No v=spf1 TXT record', 'Publish an SPF record listing your mail providers, ending in -all.');
    else if (/\+all/i.test(n.spf)) add('Email security', 'critical', 'SPF allows the entire internet to send as you (+all)', 'Your SPF record explicitly authorises spoofers.', n.spf, 'Change +all to -all.');
    if (!n.dmarc) add('Email security', 'high', 'No DMARC: email impersonation is not blocked', 'Phishing emails pretending to be your company land in inboxes, damaging trust and enabling wire fraud.', 'No _dmarc TXT record', 'Publish DMARC, start at p=none with reporting, then move to p=reject.');
    else if (n.dmarcPolicy === 'none') add('Email security', 'medium', 'DMARC is in monitor-only mode (p=none)', 'You can see spoofing but nothing is stopped.', n.dmarc, 'Move to p=quarantine, then p=reject.');
    if (n.spf && n.dmarc && n.dmarcPolicy !== 'none') add('Email security', 'pass', 'Email spoofing protection enforced', 'Mail servers reject email faking your domain.', `DMARC p=${n.dmarcPolicy}`, '');
  }

  // DNS / domain
  if (n.ds === false) add('Domain & DNS', 'low', 'DNSSEC not enabled', 'DNS answers for your domain can be forged to redirect visitors.', '', 'Enable DNSSEC at your registrar/DNS provider.');
  if (!n.caa?.length) add('Domain & DNS', 'info', 'No CAA record', 'Any certificate authority may issue certificates for your domain.', '', 'Add a CAA record naming your certificate provider.');
  if (d.rdap?.daysLeft != null) {
    if (d.rdap.daysLeft < 30) add('Domain & DNS', 'high', `Domain registration expires in ${d.rdap.daysLeft} days`, 'An expired domain can be bought by someone else, along with all your email.', `Expires ${d.rdap.expires}`, 'Renew now and enable auto-renew.');
    if (d.rdap.locked === false) add('Domain & DNS', 'low', 'Domain transfer lock not detected', 'Your domain could be hijacked through a fraudulent transfer.', '', 'Enable registrar transfer lock.');
  }
  if (!d.securityTxt?.present) add('Domain & DNS', 'info', 'No security.txt contact', 'Researchers who find a hole in your site have no way to tell you before criminals find it.', '', 'Publish /.well-known/security.txt with a contact email.');

  // Exposure
  for (const p of d.ports?.open || []) {
    if (p.risk === 'info' || p.port === 25) continue;
    add('Exposed services', p.risk, `${p.svc} reachable from the internet (port ${p.port})`, p.risk === 'critical' ? 'This service is a top target for ransomware gangs and automated attacks.' : 'An extra door into your infrastructure that attackers will try to open.', `${d.ports.ip}:${p.port} accepted a connection`, 'Close the port in your firewall or restrict it to a VPN / allow-list.');
  }
  for (const f of d.files || []) if (f.found) add('Exposed services', f.sev, `Publicly downloadable: ${f.label}`, f.sev === 'critical' ? 'May hand attackers passwords, API keys or your entire source code.' : 'Gives attackers a map of your system.', f.path, 'Block access to this path on your web server.');
  if (d.subdomains?.sensitive?.length) add('Attack surface', 'medium', `${d.subdomains.sensitive.length} sensitive-looking subdomains are publicly listed`, 'Staging, admin and dev systems are usually less protected, and they are the first places attackers look.', d.subdomains.sensitive.slice(0, 6).join(', '), 'Put non-production systems behind SSO / VPN.');

  // Reputation
  const bl = (d.reputation || []).filter((r) => r.blocked);
  if (bl.length) add('Reputation', 'critical', `Domain is flagged by ${bl.length} threat-intelligence feed(s)`, 'Security filters are blocking your site, so customers and partners may not be able to reach you.', bl.map((b) => b.name).join(', '), 'Investigate for compromise/malware, then request delisting.');
  else if (d.reputation?.length) add('Reputation', 'pass', `Clean on ${d.reputation.length} threat-intelligence blocklists`, 'Your domain is not currently flagged for malware or phishing.', d.reputation.map((r) => r.name).join(', '), '');

  return F;
}

export function score(findings) {
  let s = 100;
  for (const f of findings) s -= SEV_WEIGHT[f.severity] || 0;
  s = Math.max(5, Math.min(100, s));
  const grade = s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 65 ? 'C' : s >= 50 ? 'D' : 'F';
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, pass: 0 };
  for (const f of findings) counts[f.severity]++;
  const cats = {};
  for (const f of findings) {
    cats[f.category] ??= { name: f.category, score: 100, issues: 0 };
    cats[f.category].score -= (SEV_WEIGHT[f.severity] || 0) * 2;
    if (!['pass', 'info'].includes(f.severity)) cats[f.category].issues++;
  }
  for (const c of Object.values(cats)) c.score = Math.max(0, c.score);
  return { score: s, grade, counts, categories: Object.values(cats) };
}

// ---------------- orchestrator ----------------

export const STEPS = [
  ['tls', 'Inspecting encryption certificate'],
  ['oldTls', 'Testing for outdated encryption'],
  ['redirect', 'Checking HTTP → HTTPS'],
  ['page', 'Analysing homepage & security headers'],
  ['dns', 'Reading DNS & email anti-spoofing records'],
  ['reputation', 'Querying threat-intelligence blocklists'],
  ['ports', 'Probing for exposed services'],
  ['files', 'Looking for leaked files'],
  ['securityTxt', 'Checking disclosure policy'],
  ['rdap', 'Checking domain registration'],
  ['subdomains', 'Mapping attack surface (certificate logs)'],
];

export async function scan(input, onStep = () => {}) {
  const target = normalizeTarget(input);
  const d = { target, startedAt: new Date().toISOString() };
  const wrap = async (key, fn) => {
    const label = STEPS.find((s) => s[0] === key)?.[1] || key;
    onStep({ key, label, state: 'start' });
    const t0 = Date.now();
    try { d[key] = await fn(); } catch (e) { d[key] = { error: e.message }; }
    onStep({ key, label, state: 'done', ms: Date.now() - t0 });
    return d[key];
  };
  const tlsP = wrap('tls', () => checkTLS(target));
  await Promise.all([
    tlsP,
    wrap('oldTls', () => checkOldTLS(target)),
    wrap('redirect', () => checkHttpRedirect(target)),
    wrap('page', () => checkPage(target)),
    wrap('dns', () => checkDNS(target)),
    wrap('reputation', () => checkReputation(target)),
    wrap('ports', () => checkPorts(target)),
    wrap('files', () => checkExposedFiles(target)),
    wrap('securityTxt', () => checkSecurityTxt(target)),
    wrap('rdap', () => checkRDAP(target)),
    tlsP.then((t) => wrap('subdomains', () => checkSubdomains(target, t))),
  ]);
  if (d.page?.error) {
    try { d.page = await checkPage({ url: `https://${target.apex === target.host ? 'www.' + target.host : target.apex}/` }); } catch { /* keep error */ }
  }
  const findings = buildFindings(d);
  const sev = { critical: 0, high: 1, medium: 2, low: 3, info: 4, pass: 5 };
  findings.sort((a, b) => sev[a.severity] - sev[b.severity]);
  return { ...d, findings, summary: score(findings), finishedAt: new Date().toISOString() };
}
