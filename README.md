# Moviepoa

Moviepoa is a small API + database app for tracking your top 100 movies. It includes CRUD endpoints for movies, ranking support, and optional search/read access via TMDB.

## Quick start

1. Install deps

```bash
npm install
```

2. Configure env

```bash
copy .env.example .env
```

Set `TMDB_API_READ_TOKEN` and `TMDB_API_KEY` in `.env`.

3. Run

```bash
npm run start
```

API runs at `http://localhost:3000` by default.

## API overview

### Health

- `GET /health`

### Movies (CRUD)

- `GET /movies` -> list all movies (ranked first)
- `GET /movies/top` -> list ranked movies only
- `GET /movies/:id` -> get movie by id
- `POST /movies` -> create
- `PUT /movies/:id` -> replace fields
- `PATCH /movies/:id/rank` -> set rank
- `DELETE /movies/:id` -> delete

#### Movie fields

- `title` (required)
- `tmdb_id` (optional)
- `release_year` (optional)
- `overview` (optional)
- `poster_path` (optional)
- `rank` (optional, 1-100)

Rank conflicts are resolved by shifting existing ranks down. Items pushed beyond rank 100 become unranked.

### TMDB (search + details)

- `GET /tmdb/search?q=interstellar&page=1`
- `GET /tmdb/movie/:tmdbId`

## Example requests

Create a movie:

```bash
curl -X POST http://localhost:3000/movies \
  -H "Content-Type: application/json" \
  -d '{"title":"Interstellar","release_year":2014,"rank":1}'
```

Update a movie:

```bash
curl -X PUT http://localhost:3000/movies/1 \
  -H "Content-Type: application/json" \
  -d '{"title":"Interstellar","release_year":2014,"rank":2}'
```

Set rank only:

```bash
curl -X PATCH http://localhost:3000/movies/1/rank \
  -H "Content-Type: application/json" \
  -d '{"rank":5}'
```

Search TMDB:

```bash
curl "http://localhost:3000/tmdb/search?q=alien"
```

## Notes

- Database file is `./db/moviepoa.sqlite` by default.
- The app uses SQLite with WAL mode.
- Use your own TMDB token/key. Do not commit secrets.
