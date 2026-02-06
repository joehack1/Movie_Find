const MAX_RANK = 100;

function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  return n;
}

function validateMoviePayload(payload) {
  const errors = [];
  const movie = {};

  if (!payload || typeof payload !== 'object') {
    return { errors: ['Body must be a JSON object'], movie: null };
  }

  if (payload.title && typeof payload.title === 'string') {
    movie.title = payload.title.trim();
  }

  if (!movie.title) {
    errors.push('title is required');
  }

  if (payload.tmdb_id !== undefined) {
    const tmdbId = toInt(payload.tmdb_id);
    if (tmdbId === null) {
      errors.push('tmdb_id must be an integer');
    } else {
      movie.tmdb_id = tmdbId;
    }
  }

  if (payload.release_year !== undefined) {
    const year = toInt(payload.release_year);
    if (year === null || year < 1870 || year > 2100) {
      errors.push('release_year must be a valid year');
    } else {
      movie.release_year = year;
    }
  }

  if (payload.overview !== undefined) {
    if (payload.overview === null) {
      movie.overview = null;
    } else if (typeof payload.overview === 'string') {
      movie.overview = payload.overview.trim();
    } else {
      errors.push('overview must be a string');
    }
  }

  if (payload.poster_path !== undefined) {
    if (payload.poster_path === null) {
      movie.poster_path = null;
    } else if (typeof payload.poster_path === 'string') {
      movie.poster_path = payload.poster_path.trim();
    } else {
      errors.push('poster_path must be a string');
    }
  }

  if (payload.rank !== undefined) {
    const rank = toInt(payload.rank);
    if (rank === null || rank < 1 || rank > MAX_RANK) {
      errors.push('rank must be an integer between 1 and 100');
    } else {
      movie.rank = rank;
    }
  }

  return { errors, movie };
}

function validateRankPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    return { errors: ['Body must be a JSON object'], rank: null };
  }

  const rank = toInt(payload.rank);
  if (rank === null || rank < 1 || rank > MAX_RANK) {
    errors.push('rank must be an integer between 1 and 100');
  }

  return { errors, rank };
}

module.exports = {
  MAX_RANK,
  validateMoviePayload,
  validateRankPayload,
};
