const { useEffect, useMemo, useRef, useState } = React;

const tokenKey = 'moviepoa_token';

function useToken() {
  const [token, setTokenState] = useState(() => localStorage.getItem(tokenKey));

  const setToken = (next) => {
    if (next) {
      localStorage.setItem(tokenKey, next);
    } else {
      localStorage.removeItem(tokenKey);
    }
    setTokenState(next);
  };

  return [token, setToken];
}

async function apiFetch(path, { token, method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = data.error || (data.errors ? data.errors.join(', ') : 'Request failed');
    throw new Error(error);
  }
  return data;
}

function App() {
  const [token, setToken] = useToken();
  const [user, setUser] = useState(null);
  const [genres, setGenres] = useState([]);
  const [movies, setMovies] = useState([]);
  const [status, setStatus] = useState('');
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [genreMovies, setGenreMovies] = useState([]);
  const [genrePage, setGenrePage] = useState(1);
  const [genreTotalPages, setGenreTotalPages] = useState(1);
  const [genreStatus, setGenreStatus] = useState('');
  const [genreLoading, setGenreLoading] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoadingId, setTrailerLoadingId] = useState(null);
  const spotlightRef = useRef(null);

  const tmdbImage = (path, size = 'w780') =>
    path ? `https://image.tmdb.org/t/p/${size}${path}` : '';
  const bannerItems = [
    {
      title: 'Send Help',
      desc: 'Official poster. In theaters Jan 30, 2026.',
      img: 'https://cdn.moviefone.com/admin-uploads/highlights/images/send-help-official-poster_1760463382.webp',
    },
    {
      title: 'The Strangers: Chapter 3',
      desc: 'Official poster. In theaters Feb 6, 2026.',
      img: 'https://cdn.moviefone.com/admin-uploads/highlights/images/the-strangers-chapter-3-official-poster_1770052962.webp',
    },
    {
      title: 'Crime 101',
      desc: 'Official poster. In theaters Feb 13, 2026.',
      img: 'https://cdn.moviefone.com/admin-uploads/highlights/images/crime-101-official-poster_1766171076.webp',
    },
    {
      title: 'GOAT',
      desc: 'Official poster. In theaters Feb 13, 2026.',
      img: 'https://cdn.moviefone.com/admin-uploads/highlights/images/goat-official-poster_1763994055.webp',
    },
    {
      title: 'Scream 7',
      desc: 'Official poster. In theaters Feb 27, 2026.',
      img: 'https://cdn.moviefone.com/admin-uploads/highlights/images/scream-7-official-poster_1768416858.webp',
    },
  ];

  useEffect(() => {
    apiFetch('/tmdb/genres')
      .then((data) => setGenres(data.genres || []))
      .catch(() => setGenres([]));
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setMovies([]);
      return;
    }
    apiFetch('/auth/me', { token })
      .then((data) => setUser(data))
      .catch(() => {
        setToken(null);
        setUser(null);
      });
  }, [token]);

  const loadMovies = () => {
    if (!token) return;
    apiFetch('/movies', { token })
      .then((data) => setMovies(data.movies || []))
      .catch((err) => setStatus(err.message));
  };

  const loadGenreMovies = async (genre, page = 1) => {
    if (!genre) return;
    setGenreStatus('');
    setGenreLoading(true);
    try {
      const data = await apiFetch(`/tmdb/genre/${genre.id}/movies?page=${page}`);
      setGenreMovies((prev) => (page === 1 ? data.results || [] : [...prev, ...(data.results || [])]));
      setGenrePage(data.page || page);
      setGenreTotalPages(data.total_pages || 1);
    } catch (err) {
      setGenreStatus(err.message);
      setGenreMovies([]);
    } finally {
      setGenreLoading(false);
    }
  };

  const handleGenreClick = (genre) => {
    setSelectedGenre(genre);
    loadGenreMovies(genre, 1);
    if (spotlightRef.current) {
      spotlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleLoadMoreGenres = () => {
    if (!selectedGenre || genreLoading) return;
    if (genrePage >= genreTotalPages) return;
    loadGenreMovies(selectedGenre, genrePage + 1);
  };

  const handleOpenTrailer = async (movie) => {
    setTrailerLoadingId(movie.id);
    setGenreStatus('');
    try {
      const data = await apiFetch(`/tmdb/movie/${movie.id}/videos`);
      const list = Array.isArray(data.results) ? data.results : [];
      const youtube = list.filter((v) => v.site === 'YouTube');
      const pick =
        youtube.find((v) => v.type === 'Trailer') ||
        youtube.find((v) => v.type === 'Teaser') ||
        youtube[0];
      if (!pick) {
        setGenreStatus('No trailer found for this title yet.');
        setTrailerLoading(false);
        return;
      }
      setTrailer({
        title: movie.title,
        url: `https://www.youtube.com/embed/${pick.key}?autoplay=1&rel=0`,
        watchUrl: `https://www.youtube.com/watch?v=${pick.key}`,
      });
    } catch (err) {
      setGenreStatus(err.message);
    } finally {
      setTrailerLoadingId(null);
    }
  };

  useEffect(() => {
    loadMovies();
  }, [token]);

  const ranked = useMemo(() => movies.filter((m) => m.rank).sort((a, b) => a.rank - b.rank), [movies]);

  const handleAuth = async (endpoint, payload) => {
    setStatus('');
    try {
      const data = await apiFetch(endpoint, { method: 'POST', body: payload });
      setToken(data.token);
      setUser(data.user);
      setStatus('Logged in successfully.');
    } catch (err) {
      setStatus(err.message);
    }
  };

  const handleAddMovie = async (payload) => {
    setStatus('');
    try {
      const data = await apiFetch('/movies', { method: 'POST', token, body: payload });
      setMovies((prev) => [data, ...prev]);
      setStatus('Movie added.');
    } catch (err) {
      setStatus(err.message);
    }
  };

  const handleAddFromTmdb = async (tmdbId, rank) => {
    setStatus('');
    try {
      const details = await apiFetch(`/tmdb/movie/${tmdbId}`);
      const payload = {
        tmdb_id: details.id,
        title: details.title,
        release_year: details.release_date ? Number(details.release_date.slice(0, 4)) : undefined,
        overview: details.overview,
        poster_path: details.poster_path,
        rank: rank || undefined,
      };
      await apiFetch('/movies', { method: 'POST', token, body: payload });
      setStatus('Movie added from TMDB.');
      loadMovies();
    } catch (err) {
      setStatus(err.message);
    }
  };

  const handleReorder = async (orderedIds) => {
    setStatus('');
    try {
      await apiFetch('/movies/reorder', {
        method: 'POST',
        token,
        body: { ordered_ids: orderedIds },
      });
      setStatus('Ranking updated.');
      loadMovies();
    } catch (err) {
      setStatus(err.message);
    }
  };

  const handleUpdateProfile = async (displayName) => {
    setStatus('');
    try {
      const data = await apiFetch('/auth/me', {
        method: 'PUT',
        token,
        body: { display_name: displayName },
      });
      setUser(data);
      setStatus('Profile updated.');
    } catch (err) {
      setStatus(err.message);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setMovies([]);
  };

  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">Moviepoa</div>
        <div>
          {user ? (
            <button className="secondary" onClick={handleLogout}>Logout</button>
          ) : (
            <span className="pill">Top 100 Club</span>
          )}
        </div>
      </nav>

      <section className="hero">
        <div>
          <span className="pill">Your taste, ranked</span>
          <h1>Curate a top 100 list that feels personal.</h1>
          <p>
            Moviepoa keeps your ranked favorites in one place. Explore genres, then build a list that
            reflects your taste. Anyone can explore the home page. Log in to unlock your personal ranking.
          </p>
        </div>
        <div className="hero-slider" aria-label="Featured movie banners">
          <div className="hero-slider__track">
            {bannerItems.map((item, idx) => (
              <div className="banner-card" key={`banner-${idx}`} style={{ backgroundImage: `url(${item.img})` }}>
                <div className="banner-info">
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </div>
              </div>
            ))}
            {bannerItems.map((item, idx) => (
              <div className="banner-card" key={`banner-dup-${idx}`} style={{ backgroundImage: `url(${item.img})` }}>
                <div className="banner-info">
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="hero-slider__note">Hover a banner to reveal its story.</div>
        </div>
      </section>

      <section className="section">
        <h2>Genres to browse</h2>
        <p>Powered by TMDB genre data.</p>
        <div className="genres-grid">
          {genres.length === 0 ? (
            <div className="genre-card">Loading genres...</div>
          ) : (
            genres.map((genre) => (
              <button
                key={genre.id}
                className={`genre-card ${selectedGenre?.id === genre.id ? 'active' : ''}`}
                onClick={() => handleGenreClick(genre)}
                type="button"
              >
                {genre.name}
              </button>
            ))
          )}
        </div>
      </section>

      <section className="section genre-spotlight" ref={spotlightRef}>
        <div className="genre-spotlight__header">
          <div>
            <h2>{selectedGenre ? `${selectedGenre.name} picks` : 'Select a genre'}</h2>
            <p>
              {selectedGenre
                ? 'Fresh titles pulled from TMDB with accurate artwork, overviews, and trailers.'
                : 'Choose a genre above to load the exact movie type list with banners and descriptions.'}
            </p>
          </div>
          {selectedGenre && (
            <div className="genre-spotlight__meta">
              <span className="pill">Page {genrePage} / {genreTotalPages}</span>
            </div>
          )}
        </div>

        {genreStatus && <div className="status">{genreStatus}</div>}

        <div className="genre-movie-grid">
          {genreLoading && genreMovies.length === 0 && (
            <div className="genre-movie-card skeleton">Loading movies...</div>
          )}
          {genreMovies.map((movie, idx) => {
            const banner = tmdbImage(movie.backdrop_path, 'w780') || tmdbImage(movie.poster_path, 'w500');
            return (
              <div className="genre-movie-card" key={movie.id} style={{ '--delay': `${idx * 60}ms` }}>
                <div className="genre-movie-banner" style={{ backgroundImage: banner ? `url(${banner})` : 'none' }}>
                  {!banner && <div className="genre-movie-fallback">No banner available</div>}
                </div>
                <div className="genre-movie-body">
                  <div className="genre-movie-title">
                    <h3>{movie.title}</h3>
                    <span>{movie.release_date ? movie.release_date.slice(0, 4) : '—'}</span>
                  </div>
                  <p>{movie.overview || 'No description available yet.'}</p>
                  <div className="genre-movie-actions">
                    <button className="secondary" onClick={() => handleOpenTrailer(movie)} type="button">
                      {trailerLoadingId === movie.id ? 'Loading trailer...' : 'Watch trailer'}
                    </button>
                    <div className="rating-chip">Rating {movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {selectedGenre && genrePage < genreTotalPages && (
          <button className="load-more" onClick={handleLoadMoreGenres} type="button">
            {genreLoading ? 'Loading...' : 'Load more'}
          </button>
        )}
      </section>

      <section className="section">
        <div className="panel-grid">
          {!user && (
            <AuthPanel onAuth={handleAuth} status={status} />
          )}
          {user && (
            <UserPanel
              user={user}
              movies={ranked}
              onAddMovie={handleAddMovie}
              onAddFromTmdb={handleAddFromTmdb}
              onReorder={handleReorder}
              onUpdateProfile={handleUpdateProfile}
              status={status}
            />
          )}
          <div className="panel">
            <h3>About Moviepoa</h3>
            <p>
              Built for people who treat movie lists like a craft. Track, rank, and iterate. The home
              page stays open to everyone, while your list stays personal once you log in.
            </p>
          </div>
        </div>
      </section>

      {trailer && (
        <div className="trailer-modal" onClick={() => setTrailer(null)} role="dialog" aria-modal="true">
          <div className="trailer-modal__content" onClick={(e) => e.stopPropagation()}>
            <div className="trailer-modal__header">
              <h3>{trailer.title} trailer</h3>
              <button className="secondary" onClick={() => setTrailer(null)} type="button">Close</button>
            </div>
            <div className="trailer-frame">
              <iframe
                src={trailer.url}
                title={`${trailer.title} trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <a className="trailer-link" href={trailer.watchUrl} target="_blank" rel="noreferrer">
              Open on YouTube
            </a>
          </div>
        </div>
      )}

      <footer className="footer">Moviepoa ? Top 100 curator</footer>
    </div>
  );
}

function AuthPanel({ onAuth, status }) {
  const [register, setRegister] = useState({ email: '', password: '', display_name: '' });
  const [login, setLogin] = useState({ email: '', password: '' });

  return (
    <div className="panel">
      <h3>Log in or create an account</h3>
      <p>Accounts unlock your personal top 100 list.</p>
      <div>
        <h4>Login</h4>
        <label>Email</label>
        <input value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} />
        <label>Password</label>
        <input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} />
        <button onClick={() => onAuth('/auth/login', login)}>Login</button>
      </div>
      <div style={{ marginTop: '20px' }}>
        <h4>Register</h4>
        <label>Name</label>
        <input value={register.display_name} onChange={(e) => setRegister({ ...register, display_name: e.target.value })} />
        <label>Email</label>
        <input value={register.email} onChange={(e) => setRegister({ ...register, email: e.target.value })} />
        <label>Password</label>
        <input type="password" value={register.password} onChange={(e) => setRegister({ ...register, password: e.target.value })} />
        <button onClick={() => onAuth('/auth/register', register)}>Create account</button>
      </div>
      {status && <div className="status">{status}</div>}
    </div>
  );
}

function UserPanel({ user, movies, onAddMovie, onAddFromTmdb, onReorder, onUpdateProfile, status }) {
  const [form, setForm] = useState({ title: '', release_year: '', rank: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [searchRank, setSearchRank] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [draggedId, setDraggedId] = useState(null);
  const [displayName, setDisplayName] = useState(user.display_name || '');

  useEffect(() => {
    setDisplayName(user.display_name || '');
  }, [user]);

  const handleSubmit = () => {
    const payload = {
      title: form.title,
      release_year: form.release_year ? Number(form.release_year) : undefined,
      rank: form.rank ? Number(form.rank) : undefined,
    };
    onAddMovie(payload);
    setForm({ title: '', release_year: '', rank: '' });
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    try {
      const data = await apiFetch(`/tmdb/search?q=${encodeURIComponent(searchTerm)}`);
      setSearchResults(data.results || []);
    } catch (err) {
      setSearchResults([]);
    }
  };

  const handleDrop = (targetId) => {
    if (!draggedId || draggedId === targetId) return;
    const current = [...movies];
    const fromIndex = current.findIndex((m) => m.id === draggedId);
    const toIndex = current.findIndex((m) => m.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    const orderedIds = current.map((m) => m.id);
    onReorder(orderedIds);
  };

  return (
    <div className="panel">
      <h3>Welcome back{user.display_name ? `, ${user.display_name}` : ''}.</h3>
      <p>Build your top 100 list.</p>

      <div className="profile-card">
        <h4>Edit profile</h4>
        <label>Display name</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <button onClick={() => onUpdateProfile(displayName)}>Save profile</button>
      </div>

      <div style={{ marginTop: '18px' }}>
        <h4>Search TMDB</h4>
        <label>Search</label>
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <label>Rank (optional)</label>
        <input value={searchRank} onChange={(e) => setSearchRank(e.target.value)} />
        <button onClick={handleSearch}>Search</button>
        <div className="search-results">
          {searchResults.map((movie) => (
            <div key={movie.id} className="search-item">
              <div>
                <strong>{movie.title}</strong> {movie.release_date ? `(${movie.release_date.slice(0, 4)})` : ''}
              </div>
              <button
                className="secondary"
                onClick={() => onAddFromTmdb(movie.id, searchRank ? Number(searchRank) : undefined)}
              >
                Add
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '18px' }}>
        <h4>Add manually</h4>
        <label>Movie title</label>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <label>Release year</label>
        <input value={form.release_year} onChange={(e) => setForm({ ...form, release_year: e.target.value })} />
        <label>Rank (1-100)</label>
        <input value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} />
        <button onClick={handleSubmit}>Add movie</button>
      </div>

      {status && <div className="status">{status}</div>}

      <div style={{ marginTop: '18px' }}>
        <h4>Your ranked list</h4>
        <div className="movie-list">
          {movies.length === 0 ? (
            <div className="movie-item">No ranked movies yet.</div>
          ) : (
            movies.map((movie) => (
              <div
                key={movie.id}
                className="movie-item draggable"
                draggable
                onDragStart={() => setDraggedId(movie.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(movie.id)}
              >
                <div className="rank">#{movie.rank || '-'} </div>
                <div style={{ flex: 1 }}>
                  <strong>{movie.title}</strong> {movie.release_year ? `(${movie.release_year})` : ''}
                </div>
                <div className="drag-handle">Drag</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
