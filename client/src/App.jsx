import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ThreadPage from './pages/ThreadPage.jsx';
import { getCurrentUser, logout } from './services/authService.js';

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      try {
        const currentUser = await getCurrentUser();
        if (active) {
          setUser(currentUser);
        }
      } catch (_error) {
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    }

    loadCurrentUser();
    return () => {
      active = false;
    };
  }, []);

  async function onLogout() {
    try {
      await logout();
    } finally {
      setUser(null);
    }
  }

  return (
    <div>
      <header style={{ padding: '1rem', borderBottom: '1px solid #ddd' }}>
        <nav style={{ display: 'flex', gap: '1rem' }}>
          <Link to="/">Home</Link>
          {authLoading ? null : user ? (
            <>
              <span>Signed in as {user.name}</span>
              <button type="button" onClick={onLogout}>
                Logout
              </button>
            </>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </nav>
      </header>

      <main style={{ padding: '1rem' }}>
        <Routes>
          <Route path="/" element={<HomePage user={user} />} />
          <Route path="/login" element={<LoginPage onAuthSuccess={setUser} />} />
          <Route path="/threads/:threadId" element={<ThreadPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
