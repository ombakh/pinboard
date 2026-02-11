import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createThread, fetchThreads } from '../services/threadService.js';

function HomePage({ user }) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    body: ''
  });
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadThreads() {
      try {
        const threadList = await fetchThreads();
        if (active) {
          setThreads(threadList);
        }
      } catch (_error) {
        if (active) {
          setError('Could not load threads');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadThreads();
    return () => {
      active = false;
    };
  }, []);

  function onChange(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setPosting(true);

    try {
      const created = await createThread(form);
      setThreads((current) => [created, ...current]);
      setForm({ title: '', body: '' });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <section>
      <h1>Forum Home</h1>
      {!user ? (
        <p>
          You need to <Link to="/login">login</Link> to post a thread.
        </p>
      ) : null}

      <form
        onSubmit={onSubmit}
        style={{ display: 'grid', gap: '0.75rem', maxWidth: 680 }}
      >
        <input
          name="title"
          value={form.title}
          onChange={onChange}
          placeholder="Thread title"
          required
        />
        <textarea
          name="body"
          value={form.body}
          onChange={onChange}
          placeholder="What do you want to discuss?"
          rows={6}
          required
        />
        <button type="submit" disabled={posting || !user}>
          {posting ? 'Posting...' : 'Post Thread'}
        </button>
      </form>

      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      <h2>Recent Threads</h2>
      {loading ? <p>Loading...</p> : null}
      {!loading && threads.length === 0 ? <p>No threads yet.</p> : null}
      <ul>
        {threads.map((thread) => (
          <li key={thread.id}>
            <Link to={`/threads/${thread.id}`}>{thread.title}</Link>{' '}
            <small>by {thread.authorName}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default HomePage;
