const { wrapUrl } = require('./shared');

const API_PROXY = 'https://moviebox.cinebit.workers.dev/?url=';

const HOST = 'h5.aoneroom.com';
const API_HOST = 'h5-api.aoneroom.com';
const HOST_URL = `https://${HOST}`;
const API_BASE = `https://${API_HOST}`;

function proxyUrl(url) {
  return API_PROXY + encodeURIComponent(url);
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

const SESSION_HEADERS = {
  'X-Client-Info': '{"timezone":"Asia/Calcutta"}',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept': 'application/json',
  'User-Agent': UA,
  'Referer': HOST_URL,
};

const COOKIE_JAR = {};
let bearerToken = '';
let sessionValid = false;

function extractCookies(resp) {
  resp.headers.forEach((value, name) => {
    if (name.toLowerCase() === 'set-cookie') {
      const [nv] = value.split(';');
      const eq = nv.indexOf('=');
      if (eq > 0) COOKIE_JAR[nv.substring(0, eq).trim()] = nv.substring(eq + 1).trim();
    }
  });
}

function buildHeaders(extra = {}) {
  const h = { ...SESSION_HEADERS, ...extra };
  if (bearerToken) h['Authorization'] = `Bearer ${bearerToken}`;
  const entries = Object.entries(COOKIE_JAR);
  if (entries.length) h['Cookie'] = entries.map(([k, v]) => `${k}=${v}`).join('; ');
  return h;
}

async function initSession() {
  try {
    const r1 = await fetch(proxyUrl(`${API_BASE}/wefeed-h5api-bff/subject/search-suggest`), {
      method: 'POST',
      headers: { ...SESSION_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: 'avatar', perPage: 0 }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r1.ok) return false;
    extractCookies(r1);
    const xUser = r1.headers.get('x-user');
    if (!xUser) return false;
    bearerToken = JSON.parse(xUser).token;

    const r2 = await fetch(proxyUrl(`${HOST_URL}/wefeed-h5-bff/app/get-latest-app-pkgs?app_name=moviebox`), {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (!r2.ok) return false;
    extractCookies(r2);

    sessionValid = true;
    return true;
  } catch {
    return false;
  }
}

async function apiPost(url, body) {
  try {
    const r = await fetch(proxyUrl(url), {
      method: 'POST',
      headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    extractCookies(r);
    const j = await r.json();
    return j.code === 0 && j.message === 'ok' ? j.data : null;
  } catch {
    return null;
  }
}

async function apiGet(url, extraHeaders = {}) {
  try {
    const r = await fetch(proxyUrl(url), {
      method: 'GET',
      headers: buildHeaders(extraHeaders),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    extractCookies(r);
    const j = await r.json();
    return j.code === 0 && j.message === 'ok' ? j.data : null;
  } catch {
    return null;
  }
}

async function search(keyword) {
  return apiPost(`${API_BASE}/wefeed-h5api-bff/subject/search`, {
    keyword, page: 1, perPage: 24, subjectType: 0,
  });
}

async function playInfo(subjectId, detailPath, season, episode) {
  const se = season ?? 0;
  const ep = episode ?? 0;
  return apiGet(
    `${HOST_URL}/wefeed-h5-bff/web/subject/play?subjectId=${subjectId}&se=${se}&ep=${ep}`,
    { 'Referer': `${HOST_URL}/movies/${detailPath}` }
  );
}

function qualityLabel(res) {
  if (!res) return 'Auto';
  if (res.includes('2160')) return '4K';
  if (res.includes('1440')) return '1440p';
  if (res.includes('1080')) return '1080p';
  if (res.includes('720')) return '720p';
  if (res.includes('480')) return '480p';
  if (res.includes('360')) return '360p';
  return 'Auto';
}

const Q_ORDER = ['4K', '1440p', '1080p', '720p', '480p', '360p', 'Auto'];

function sortQualities(src) {
  const s = {};
  for (const q of Q_ORDER) { if (src[q]) s[q] = src[q]; }
  for (const q of Object.keys(src)) { if (!Q_ORDER.includes(q)) s[q] = src[q]; }
  return s;
}

async function getSources(meta) {
  const { type, title } = meta;
  const season = type === 'tv' ? (meta.season || 1) : null;
  const episode = type === 'tv' ? (meta.episode || 1) : null;

  if (!title) return null;

  if (!sessionValid) {
    const ok = await initSession();
    if (!ok) return null;
  }

  const searchData = await search(title);
  if (!searchData?.items?.length) return null;

  const targetType = type === 'movie' ? 1 : 2;
  const lcTitle = title.toLowerCase();

  let item = searchData.items.find(i => i.subjectType === targetType && i.title?.toLowerCase() === lcTitle);
  if (!item) item = searchData.items.find(i => i.subjectType === targetType && i.title?.toLowerCase().includes(lcTitle));
  if (!item) item = searchData.items.find(i => i.subjectType === targetType);
  if (!item) return null;

  const playData = await playInfo(item.subjectId, item.detailPath, season, episode);
  if (!playData?.streams?.length) return null;

  const sources = {};
  for (const stream of playData.streams) {
    if (!stream.url || !stream.url.startsWith('http')) continue;
    const q = stream.resolutions ? qualityLabel(String(stream.resolutions)) : 'Auto';
    if (!sources['Default']) sources['Default'] = {};
    sources['Default'][q] = wrapUrl(stream.url);
  }

  if (!Object.keys(sources).length) return null;

  for (const lang of Object.keys(sources)) {
    sources[lang] = sortQualities(sources[lang]);
  }

  return { sources, subtitles: [] };
}

module.exports = { getSources };
