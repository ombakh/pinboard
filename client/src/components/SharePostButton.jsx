import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import VerifiedName from './VerifiedName.jsx';
import { fetchChatUsers, sendMessage } from '../services/chatService.js';

function SharePostButton({ threadId, threadTitle }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [chatUsers, setChatUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [justShared, setJustShared] = useState(false);

  const selectedUser = useMemo(
    () => chatUsers.find((chatUser) => chatUser.id === selectedUserId) || null,
    [chatUsers, selectedUserId]
  );
  const statusMessage = loadingUsers
    ? 'Loading users...'
    : error
      ? error
      : !chatUsers.length
        ? 'No matching users found.'
        : '';

  useEffect(() => {
    if (!justShared) {
      return undefined;
    }
    const timer = window.setTimeout(() => setJustShared(false), 1800);
    return () => window.clearTimeout(timer);
  }, [justShared]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoadingUsers(true);
      setError('');
      try {
        const users = await fetchChatUsers(search);
        if (!active) {
          return;
        }
        setChatUsers(users);
        setSelectedUserId((current) => {
          if (!users.length) {
            return null;
          }
          return current && users.some((chatUser) => chatUser.id === current) ? current : users[0].id;
        });
      } catch (loadError) {
        if (active) {
          setError(loadError.message || 'Could not load users');
          setChatUsers([]);
          setSelectedUserId(null);
        }
      } finally {
        if (active) {
          setLoadingUsers(false);
        }
      }
    }, 160);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isOpen, search]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event) {
      if (event.key === 'Escape' && !sending) {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, sending]);

  function onOpen() {
    setIsOpen(true);
    setSearch('');
    setNote('');
    setError('');
  }

  function onClose() {
    if (sending) {
      return;
    }
    setIsOpen(false);
    setError('');
  }

  async function onSubmitShare(event) {
    event.preventDefault();
    if (!selectedUserId || sending) {
      return;
    }

    setSending(true);
    setError('');
    try {
      await sendMessage(selectedUserId, {
        body: note,
        sharedThreadId: threadId
      });
      setIsOpen(false);
      setNote('');
      setSearch('');
      setJustShared(true);
    } catch (shareError) {
      setError(shareError.message || 'Could not share post');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`post-share-trigger ${justShared ? 'is-shared' : ''}`}
        onClick={onOpen}
        aria-label={justShared ? 'Post shared' : 'Share post'}
      >
        <span className="post-share-trigger__icon" aria-hidden="true">
          ↗
        </span>
        <span>{justShared ? 'Shared' : 'Share'}</span>
      </button>

      {isOpen
        ? createPortal(
            <div className="share-modal-backdrop" onClick={onClose}>
              <article
                className="share-modal card"
                role="dialog"
                aria-modal="true"
                aria-labelledby={`share-modal-title-${threadId}`}
                onClick={(event) => event.stopPropagation()}
              >
                <header className="share-modal__header">
                  <div>
                    <h2 id={`share-modal-title-${threadId}`} className="page-title">
                      Share Post
                    </h2>
                    <p className="muted share-modal__context">{threadTitle || `Thread #${threadId}`}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary share-modal__close"
                    onClick={onClose}
                    aria-label="Close share dialog"
                  >
                    Close
                  </button>
                </header>

                <label className="share-modal__search-wrap">
                  <span className="share-modal__label">Select recipient</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search users..."
                    aria-label="Search users to share with"
                  />
                </label>

                <p
                  className={`${error ? 'error-text' : 'muted'} share-modal__status`}
                  role="status"
                  aria-live="polite"
                >
                  {statusMessage || '\u00A0'}
                </p>

                <ul className="share-user-list">
                  {chatUsers.map((chatUser) => (
                    <li key={chatUser.id}>
                      <button
                        type="button"
                        className={`share-user-option ${chatUser.id === selectedUserId ? 'is-selected' : ''}`}
                        onClick={() => setSelectedUserId(chatUser.id)}
                      >
                        <span className="share-user-option__name">
                          <VerifiedName name={chatUser.name} isVerified={chatUser.isEmailVerified} />
                        </span>
                        <span className="muted share-user-option__preview">
                          {chatUser.lastMessage
                            ? `${chatUser.lastMessage.slice(0, 56)}${chatUser.lastMessage.length > 56 ? '...' : ''}`
                            : 'No messages yet'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                <form className="share-modal__footer" onSubmit={onSubmitShare}>
                  <label className="share-modal__note-wrap">
                    <span className="share-modal__label">Optional note</span>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder={`Message ${selectedUser ? selectedUser.name : ''} (optional)`}
                    />
                  </label>
                  <div className="share-modal__actions">
                    <button className="btn btn--secondary" type="button" onClick={onClose} disabled={sending}>
                      Cancel
                    </button>
                    <button className="btn" type="submit" disabled={!selectedUserId || sending}>
                      {sending ? 'Sharing...' : 'Share Post'}
                    </button>
                  </div>
                </form>
              </article>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export default SharePostButton;
