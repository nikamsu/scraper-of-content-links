const { randomUA } = require('./shared');

const BASE_URL = 'https://rozgarlelo.modiplay.xyz';
const PROXY_BASE = 'https://cineverse.modiplay.xyz';
const CF_PROXY = 'https://multimovies.cinebit.workers.dev/?url=';

function buildHeaders() {
  return {
    'User-Agent': randomUA(),
    'Referer': BASE_URL + '/',
    'Origin': BASE_URL,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
}

function cfUrl(target) {
  return CF_PROXY + encodeURIComponent(target);
}

function embedUrl(meta) {
  const typePath = meta.type === 'tv' ? 'tv' : 'movie';
  let url = `${BASE_URL}/embed/tmdb/${typePath}?id=${meta.tmdbId}`;
  if (meta.type === 'tv') {
    url += `&s=${meta.season || 1}&e=${meta.episode || 1}`;
  }
  return url;
}

function extractServers(html) {
  const regex = /switchServer\('([^']*)','([^']*)','([^']*)','([^']*)','([^']*)',this\)/g;
  const servers = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    const name = match[3];
    const platform = match[2];
    const code = match[4];
    if (!name || !platform || !code) continue;
    if (servers.some(s => s.platform === platform && s.code === code)) continue;
    servers.push({ name, platform, code });
  }
  return servers;
}

function extractStreamUrls(html) {
  const directMatch = html.match(/var directSrc\s*=\s*"([^"]+)"/);
  const relayMatch = html.match(/var src\s*=\s*"([^"]+)"/);
  let directUrl = directMatch ? directMatch[1] : null;
  let relayUrl = relayMatch ? relayMatch[1] : null;
  if (directUrl) directUrl = directUrl.replace(/\\\//g, '/');
  if (relayUrl) relayUrl = relayUrl.replace(/\\\//g, '/');
  if (relayUrl && relayUrl.startsWith('/')) {
    relayUrl = PROXY_BASE + relayUrl;
  }
  return { directUrl, relayUrl };
}

async function getSources(meta) {
  const url = embedUrl(meta);
  const headers = buildHeaders();

  let embedHtml;
  try {
    const resp = await fetch(cfUrl(url), { headers, signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return null;
    embedHtml = await resp.text();
  } catch {
    return null;
  }

  const servers = extractServers(embedHtml);
  if (servers.length === 0) return null;

  const proxyUrls = servers.map(s =>
    `${PROXY_BASE}/proxy.php?p=${encodeURIComponent(s.platform)}&c=${encodeURIComponent(s.code)}&title=${encodeURIComponent(meta.title || '')}&noredirect=1`
  );

  const proxyResults = await Promise.allSettled(
    proxyUrls.map(url =>
      fetch(cfUrl(url), { headers, signal: AbortSignal.timeout(20000) })
        .then(r => r.ok ? r.text() : null)
        .catch(() => null)
    )
  );

  const sources = {};
  for (let i = 0; i < proxyResults.length; i++) {
    const r = proxyResults[i];
    if (r.status !== 'fulfilled' || !r.value) continue;
    const { relayUrl } = extractStreamUrls(r.value);
    if (!relayUrl || !relayUrl.startsWith('http')) continue;
    sources[servers[i].name] = relayUrl;
  }

  if (Object.keys(sources).length === 0) return null;
  return { sources };
}

module.exports = { getSources };
