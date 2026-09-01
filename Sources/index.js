const vdl = require('./vdl');
const moviebox = require('./moviebox');
const multimovies = require('./multimovies');

const SOURCES = [
  { name: 'MovieBox', module: moviebox },
  { name: 'VDL', module: vdl },
  { name: 'MultiMovies', module: multimovies },
];

async function getSources(meta, filterSource) {
  let sourcesToFetch = SOURCES;
  if (filterSource) {
    const filtered = SOURCES.filter(s => s.name === filterSource);
    if (filtered.length === 0) return { sources: {} };
    sourcesToFetch = filtered;
  }

  const results = await Promise.allSettled(
    sourcesToFetch.map(s => s.module.getSources(meta))
  );

  const sources = {};

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== 'fulfilled' || !r.value) continue;

    const name = sourcesToFetch[i].name;
    const result = r.value;

    if (result.sources && Object.keys(result.sources).length > 0) {
      sources[name] = {
        sources: result.sources,
        subtitles: result.subtitles || [],
      };
    }
  }

  return { sources };
}

module.exports = { getSources };
