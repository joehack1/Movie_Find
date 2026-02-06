const TMDB_BASE = 'https://api.themoviedb.org/3';

function getAuthHeaders() {
  const token = process.env.TMDB_API_READ_TOKEN;
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

async function tmdbFetch(path, query = {}) {
  const headers = getAuthHeaders();
  if (!headers) {
    const err = new Error('TMDB_API_READ_TOKEN is not configured');
    err.status = 500;
    throw err;
  }

  const url = new URL(`${TMDB_BASE}${path}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`TMDB request failed: ${res.status}`);
    err.status = res.status;
    err.details = text;
    throw err;
  }
  return res.json();
}

async function searchMovies(query, page = 1) {
  return tmdbFetch('/search/movie', { query, page, include_adult: false });
}

async function getMovie(tmdbId) {
  return tmdbFetch(`/movie/${tmdbId}`);
}

async function getGenres() {
  return tmdbFetch('/genre/movie/list');
}

module.exports = {
  searchMovies,
  getMovie,
  getGenres,
};
