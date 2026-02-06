require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { db, touchUpdatedAt, withTx } = require('./db');
const { MAX_RANK, validateMoviePayload, validateRankPayload, validateAuthPayload } = require('./validators');
const { searchMovies, getMovie, getGenres } = require('./tmdb');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(express.static('public'));

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const listAllStmt = db.prepare(`
  SELECT * FROM movies
  WHERE user_id = @user_id
  ORDER BY CASE WHEN rank IS NULL THEN 1 ELSE 0 END, rank ASC, title ASC;
`);

const listRankedStmt = db.prepare(`
  SELECT * FROM movies
  WHERE user_id = @user_id AND rank IS NOT NULL
  ORDER BY rank ASC;
`);

const getByIdStmt = db.prepare('SELECT * FROM movies WHERE id = ? AND user_id = ?;');
const insertStmt = db.prepare(`
  INSERT INTO movies (user_id, tmdb_id, title, release_year, overview, poster_path, rank)
  VALUES (@user_id, @tmdb_id, @title, @release_year, @overview, @poster_path, @rank);
`);
const updateStmt = db.prepare(`
  UPDATE movies
  SET tmdb_id = @tmdb_id,
      title = @title,
      release_year = @release_year,
      overview = @overview,
      poster_path = @poster_path,
      rank = @rank,
      updated_at = datetime('now')
  WHERE id = @id AND user_id = @user_id;
`);
const deleteStmt = db.prepare('DELETE FROM movies WHERE id = ? AND user_id = ?;');

const shiftRanksStmt = db.prepare(`
  UPDATE movies
  SET rank = rank + 1,
      updated_at = datetime('now')
  WHERE user_id = @user_id AND rank >= @fromRank AND rank <= @toRank;
`);

const clearOverflowRanksStmt = db.prepare(`
  UPDATE movies
  SET rank = NULL,
      updated_at = datetime('now')
  WHERE user_id = @user_id AND rank > @maxRank;
`);

const setRankStmt = db.prepare(`
  UPDATE movies
  SET rank = @rank,
      updated_at = datetime('now')
  WHERE id = @id AND user_id = @user_id;
`);

const getUserByEmailStmt = db.prepare('SELECT * FROM users WHERE email = ?;');
const getUserByIdStmt = db.prepare('SELECT * FROM users WHERE id = ?;');
const insertUserStmt = db.prepare(`
  INSERT INTO users (email, password_hash, display_name)
  VALUES (@email, @password_hash, @display_name);
`);

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function authOptional(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  return next();
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authorization token required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  return next();
}

function ensureRankSpace(userId, rank, excludeId = null) {
  const tx = withTx(() => {
    const fromRank = rank;
    const toRank = MAX_RANK;

    if (excludeId) {
      db.prepare(`
        UPDATE movies
        SET rank = NULL,
            updated_at = datetime('now')
        WHERE id = @excludeId AND user_id = @user_id AND rank = @rank;
      `).run({ excludeId, user_id: userId, rank });
    }

    shiftRanksStmt.run({ user_id: userId, fromRank, toRank });
    clearOverflowRanksStmt.run({ user_id: userId, maxRank: MAX_RANK });
  });
  tx();
}

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/auth/register', (req, res) => {
  const { errors, user } = validateAuthPayload(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const existing = getUserByEmailStmt.get(user.email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const password_hash = bcrypt.hashSync(user.password, 10);
  const result = insertUserStmt.run({
    email: user.email,
    password_hash,
    display_name: user.display_name || null,
  });
  const created = getUserByIdStmt.get(result.lastInsertRowid);
  const token = signToken(created);
  res.status(201).json({
    token,
    user: { id: created.id, email: created.email, display_name: created.display_name },
  });
});

app.post('/auth/login', (req, res) => {
  const { errors, user } = validateAuthPayload(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const existing = getUserByEmailStmt.get(user.email);
  if (!existing || !bcrypt.compareSync(user.password, existing.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = signToken(existing);
  res.json({
    token,
    user: { id: existing.id, email: existing.email, display_name: existing.display_name },
  });
});

app.get('/auth/me', authRequired, (req, res) => {
  const existing = getUserByIdStmt.get(req.user.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  res.json({ id: existing.id, email: existing.email, display_name: existing.display_name });
});

app.get('/movies', authRequired, (req, res) => {
  const movies = listAllStmt.all({ user_id: req.user.id });
  res.json({ count: movies.length, movies });
});

app.get('/movies/top', authRequired, (req, res) => {
  const movies = listRankedStmt.all({ user_id: req.user.id });
  res.json({ count: movies.length, movies });
});

app.get('/movies/:id', authRequired, (req, res) => {
  const movie = getByIdStmt.get(req.params.id, req.user.id);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });
  res.json(movie);
});

app.post('/movies', authRequired, (req, res) => {
  const { errors, movie } = validateMoviePayload(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const tx = withTx(() => {
    if (movie.rank) {
      ensureRankSpace(req.user.id, movie.rank);
    }

    const result = insertStmt.run({ ...movie, user_id: req.user.id });
    touchUpdatedAt.run(result.lastInsertRowid);
    return result.lastInsertRowid;
  });

  const id = tx();
  const created = getByIdStmt.get(id, req.user.id);
  res.status(201).json(created);
});

app.put('/movies/:id', authRequired, (req, res) => {
  const existing = getByIdStmt.get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Movie not found' });

  const { errors, movie } = validateMoviePayload(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const updated = {
    id: existing.id,
    tmdb_id: movie.tmdb_id ?? existing.tmdb_id,
    title: movie.title ?? existing.title,
    release_year: movie.release_year ?? existing.release_year,
    overview: movie.overview ?? existing.overview,
    poster_path: movie.poster_path ?? existing.poster_path,
    rank: movie.rank ?? existing.rank,
  };

  const tx = withTx(() => {
    if (movie.rank && movie.rank !== existing.rank) {
      ensureRankSpace(req.user.id, movie.rank, existing.id);
    }
    updateStmt.run({ ...updated, user_id: req.user.id });
  });

  tx();
  res.json(getByIdStmt.get(existing.id, req.user.id));
});

app.patch('/movies/:id/rank', authRequired, (req, res) => {
  const existing = getByIdStmt.get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Movie not found' });

  const { errors, rank } = validateRankPayload(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const tx = withTx(() => {
    if (rank !== existing.rank) {
      ensureRankSpace(req.user.id, rank, existing.id);
    }
    setRankStmt.run({ id: existing.id, rank, user_id: req.user.id });
  });

  tx();
  res.json(getByIdStmt.get(existing.id, req.user.id));
});

app.delete('/movies/:id', authRequired, (req, res) => {
  const existing = getByIdStmt.get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Movie not found' });

  deleteStmt.run(existing.id, req.user.id);
  res.status(204).send();
});

app.get('/tmdb/search', async (req, res) => {
  const query = (req.query.q || '').toString().trim();
  const page = Number(req.query.page || 1);

  if (!query) return res.status(400).json({ error: 'q query param is required' });
  if (!Number.isInteger(page) || page < 1 || page > 50) {
    return res.status(400).json({ error: 'page must be an integer between 1 and 50' });
  }

  try {
    const data = await searchMovies(query, page);
    res.json({
      page: data.page,
      total_pages: data.total_pages,
      total_results: data.total_results,
      results: data.results,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

app.get('/tmdb/genres', async (req, res) => {
  try {
    const data = await getGenres();
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

app.get('/tmdb/movie/:tmdbId', async (req, res) => {
  const tmdbId = Number(req.params.tmdbId);
  if (!Number.isInteger(tmdbId)) {
    return res.status(400).json({ error: 'tmdbId must be an integer' });
  }

  try {
    const data = await getMovie(tmdbId);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Moviepoa API running on http://localhost:${port}`);
});
