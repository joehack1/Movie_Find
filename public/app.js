const { useEffect, useMemo, useState } = React;

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

  useEffect(() => {
    if (!token) return;
    apiFetch('/movies', { token })
      .then((data) => setMovies(data.movies || []))
      .catch((err) => setStatus(err.message));
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
        <div className="hero-card">
          <h3>How it works</h3>
          <p><strong>1.</strong> Discover genres that set the mood.</p>
          <p><strong>2.</strong> Add titles and give them a rank.</p>
          <p><strong>3.</strong> Keep refining your top 100 list.</p>
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
              <div key={genre.id} className="genre-card">{genre.name}</div>
            ))
          )}
        </div>
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

function UserPanel({ user, movies, onAddMovie, status }) {
  const [form, setForm] = useState({ title: '', release_year: '', rank: '' });

  const handleSubmit = () => {
    const payload = {
      title: form.title,
      release_year: form.release_year ? Number(form.release_year) : undefined,
      rank: form.rank ? Number(form.rank) : undefined,
    };
    onAddMovie(payload);
    setForm({ title: '', release_year: '', rank: '' });
  };

  return (
    <div className="panel">
      <h3>Welcome back{user.display_name ? `, ${user.display_name}` : ''}.</h3>
      <p>Build your top 100 list.</p>
      <label>Movie title</label>
      <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <label>Release year</label>
      <input value={form.release_year} onChange={(e) => setForm({ ...form, release_year: e.target.value })} />
      <label>Rank (1-100)</label>
      <input value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} />
      <button onClick={handleSubmit}>Add movie</button>
      {status && <div className="status">{status}</div>}
      <div style={{ marginTop: '18px' }}>
        <h4>Your ranked list</h4>
        <div className="movie-list">
          {movies.length === 0 ? (
            <div className="movie-item">No ranked movies yet.</div>
          ) : (
            movies.map((movie) => (
              <div key={movie.id} className="movie-item">
                <div>
                  <div className="rank">#{movie.rank || '-'} </div>
                </div>
                <div style={{ flex: 1 }}>
                  <strong>{movie.title}</strong> {movie.release_year ? `(${movie.release_year})` : ''}
                </div>
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
