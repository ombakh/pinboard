import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchThreadById } from '../services/threadService.js';

function ThreadPage() {
  const { threadId } = useParams();
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadThread() {
      try {
        const threadData = await fetchThreadById(threadId);
        if (active) {
          setThread(threadData);
        }
      } catch (_error) {
        if (active) {
          setError('Could not load thread');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadThread();
    return () => {
      active = false;
    };
  }, [threadId]);

  if (loading) {
    return <p>Loading thread...</p>;
  }

  if (error) {
    return <p style={{ color: 'crimson' }}>{error}</p>;
  }

  if (!thread) {
    return <p>Thread not found.</p>;
  }

  return (
    <article>
      <h1>{thread.title}</h1>
      <p>
        <small>
          By {thread.authorName} on {new Date(thread.createdAt).toLocaleString()}
        </small>
      </p>
      <p>{thread.body}</p>
    </article>
  );
}

export default ThreadPage;
