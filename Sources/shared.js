const API_BASE = 'https://h5-api.aoneroom.com';
const PROXY_URL = 'https://proxy.cinebit.workers.dev/?url=';
const API_PROXY = 'https://moviebox.cinebit.workers.dev/?url=';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
];

const LANG_SUFFIXES = [
  'Hindi', 'French', 'Russian', 'Spanish', 'Portuguese', 'Tamil', 'Telugu',
  'Indonesian', 'Tagalog', 'Korean', 'Japanese', 'German', 'Italian',
  'Arabic', 'Turkish', 'Bengali', 'Urdu', 'Punjabi', 'English', 'Filipino',
  'Malay', 'Vietnamese', 'Thai', 'Burmese', 'Nepali', 'Sinhala', 'Khmer',
];

function randomUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }

function wrapUrl(u) {
  return `${PROXY_URL}${encodeURIComponent(u)}`;
}

function proxyApi(url) {
  return `${API_PROXY}${encodeURIComponent(url)}`;
}

async function fetchJson(url, opts, token, getHeaders) {
  try {
    const headers = { ...getHeaders(), ...opts.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const resp = await fetch(proxyApi(url), { ...opts, headers, signal: AbortSignal.timeout(20000) });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

function releaseYear(releaseDate) {
  return releaseDate ? releaseDate.substring(0, 4) : null;
}

function isNotSpinoff(title, seriesName) {
  const suffix = title.slice(seriesName.length).trim();
  return !suffix.includes(':');
}

let _cachedToken = null;

async function getGuestToken(getHeaders) {
  if (_cachedToken) return _cachedToken;
  try {
    const resp = await fetch(proxyApi(`${API_BASE}/wefeed-h5api-bff/subject/search-suggest`), {
      method: 'POST',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: 'avatar', perPage: 0 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const user = resp.headers.get('x-user');
    if (!user) return null;
    const parsed = JSON.parse(user);
    if (parsed.token) _cachedToken = parsed.token;
    return _cachedToken;
  } catch {
    return null;
  }
}

async function searchByTitle(keyword, token, getHeaders) {
  return fetchJson(`${API_BASE}/wefeed-h5api-bff/subject/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, page: 0, perPage: 20 }),
  }, token, getHeaders);
}

module.exports = { API_BASE, PROXY_URL, API_PROXY, USER_AGENTS, LANG_SUFFIXES, randomUA, wrapUrl, proxyApi, fetchJson, releaseYear, isNotSpinoff, getGuestToken, searchByTitle };
