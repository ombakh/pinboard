import { Link, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import ThreadPage from './pages/ThreadPage.jsx';

function App() {
  return (
    <div>
      <header style={{ padding: '1rem', borderBottom: '1px solid #ddd' }}>
        <nav style={{ display: 'flex', gap: '1rem' }}>
          <Link to="/">Home</Link>
          <Link to="/threads/1">Sample Thread</Link>
        </nav>
      </header>

      <main style={{ padding: '1rem' }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/threads/:threadId" element={<ThreadPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
