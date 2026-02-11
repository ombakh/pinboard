import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import VoteControls from '../components/VoteControls.jsx';
import { deleteThread, fetchThreadById, voteThread } from '../services/threadService.js';

function ThreadPage({ user }) {
  const navigate = useNavigate();
  const { threadId } = useParams();
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [voting, setVoting] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    return <p className="muted">Loading thread...</p>;
  }

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  if (!thread) {
    return <p className="muted">Thread not found.</p>;
  }

  async function onVote(vote) {
    setVoting(true);
    setError('');

    try {
      const updated = await voteThread(thread.id, vote);
      setThread(updated);
    } catch (voteError) {
      setError(voteError.message);
    } finally {
      setVoting(false);
    }
  }

  async function onDelete() {
    const confirmed = window.confirm('Delete this thread? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError('');
    try {
      await deleteThread(thread.id);
      navigate('/');
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete thread');
      setDeleting(false);
    }
  }

  return (
    <article className="card">
      <h1 className="page-title">{thread.title}</h1>
      <p className="muted">
        <small>
          By {thread.authorName} on {new Date(thread.createdAt).toLocaleString()}
        </small>
      </p>
      <p className="thread-body">{thread.body}</p>
      <VoteControls thread={thread} user={user} onVote={onVote} disabled={voting} />
      {user?.isAdmin ? (
        <p>
          <button className="btn btn--secondary" type="button" onClick={onDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete Thread'}
          </button>
        </p>
      ) : null}
    </article>
  );
}

export default ThreadPage;
