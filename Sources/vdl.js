const { API_BASE, LANG_SUFFIXES, randomUA, wrapUrl, fetchJson, releaseYear, isNotSpinoff, getGuestToken, searchByTitle } = require('./shared');

function buildHeaders() {
  return {
    'User-Agent': randomUA(),
    'Referer': 'https://videodownloader.site/',
    'Origin': 'https://videodownloader.site',
    'X-Source': 'downloader',
    'x-request-lang': 'en',
    'x-client-info': JSON.stringify({ timezone: 'America/New_York' }),
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
  };
}

async function getDetail(detailPath, token) {
  return fetchJson(`${API_BASE}/wefeed-h5api-bff/detail?detailPath=${encodeURIComponent(detailPath)}`, {}, token, buildHeaders);
}

async function getDownloadLinks(subjectId, season, episode, detailPath, token) {
  return fetchJson(`${API_BASE}/wefeed-h5api-bff/subject/download?subjectId=${subjectId}&se=${season}&ep=${episode}&detailPath=${encodeURIComponent(detailPath)}`, {}, token, buildHeaders);
}

function extractLanguage(title, seriesName) {
  const suffix = title.slice(seriesName.length).trim();
  const match = suffix.match(/\[(.+?)\]/);
  if (match) return match[1].trim();
  return 'Original';
}

function hasSeason(seasons, targetSeason) {
  return Array.isArray(seasons) && seasons.some(s => s.se === targetSeason);
}

async function getSources(meta) {
  const { type, title, year, season = 1, episode = 1 } = meta;

  const token = await getGuestToken(buildHeaders);
  if (!token) return null;

  const searchPromises = [searchByTitle(title, token, buildHeaders)];
  for (const lang of LANG_SUFFIXES) {
    searchPromises.push(searchByTitle(`${title} [${lang}]`, token, buildHeaders));
  }

  const searchResults = await Promise.allSettled(searchPromises);
  const seenIds = new Set();
  const candidates = [];

  for (const result of searchResults) {
    if (result.status !== 'fulfilled' || !result.value?.data?.items) continue;
    for (const item of result.value.data.items) {
      if (seenIds.has(item.subjectId)) continue;
      const typeMatch = type === 'tv' ? item.subjectType === 2 : item.subjectType === 1;
      const titleMatch = item.title.toLowerCase().startsWith(title.toLowerCase());
      const yearMatch = !year || !item.releaseDate || releaseYear(item.releaseDate) === String(year);
      if (!typeMatch || !titleMatch || !yearMatch || !isNotSpinoff(item.title, title)) continue;
      seenIds.add(item.subjectId);
      candidates.push(item);
    }
  }

  if (candidates.length === 0) return null;

  if (type === 'tv') {
    const valid = [];
    for (const c of candidates) {
      const detail = await getDetail(c.detailPath, token);
      const seasons = detail?.data?.resource?.seasons;
      if (seasons && hasSeason(seasons, season)) valid.push(c);
    }
    candidates.length = 0;
    candidates.push(...valid);
    if (candidates.length === 0) return null;
  }

  const sources = {};
  const subtitlesMap = new Map();
  const vdlSeason = type === 'tv' ? season : 0;
  const vdlEpisode = type === 'tv' ? episode : 0;

  for (const candidate of candidates) {
    const lang = extractLanguage(candidate.title, title);
    const dlResult = await getDownloadLinks(candidate.subjectId, vdlSeason, vdlEpisode, candidate.detailPath, token);
    if (!dlResult?.data?.downloads?.length) continue;

    if (!sources[lang]) sources[lang] = {};
    for (const dl of dlResult.data.downloads) {
      if (!dl.url.startsWith('http')) continue;
      sources[lang][`${dl.resolution}p`] = wrapUrl(dl.url);
    }

    if (dlResult?.data?.captions?.length) {
      for (const cap of dlResult.data.captions) {
        if (!subtitlesMap.has(cap.lan) && cap.url?.startsWith('http')) {
          subtitlesMap.set(cap.lan, { url: wrapUrl(cap.url), lang: cap.lanName });
        }
      }
    }
  }

  if (Object.keys(sources).length === 0) return null;

  return { sources, subtitles: [...subtitlesMap.values()] };
}

module.exports = { getSources };
