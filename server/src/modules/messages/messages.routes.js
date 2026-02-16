const express = require('express');
const { getDb } = require('../../db');
const requireAuth = require('../../middlewares/requireAuth');

const router = express.Router();

function serializeMessageRow(message) {
  return {
    ...message,
    senderUserId: Number(message.senderUserId),
    recipientUserId: Number(message.recipientUserId),
    sharedThreadId: message.sharedThreadId ? Number(message.sharedThreadId) : null,
    sharedThreadAuthorUserId: message.sharedThreadAuthorUserId
      ? Number(message.sharedThreadAuthorUserId)
      : null
  };
}

router.use(requireAuth);

router.get('/users', (req, res) => {
  try {
    const db = getDb();
    const viewerId = req.authUser.id;
    const search = String(req.query.search || '').trim().toLowerCase();
    const handleSearch = search.replace(/^@+/, '');

    const users = db
      .prepare(
        `SELECT
          u.id,
          u.name,
          u.handle,
          COALESCE(u.email_verified_at IS NOT NULL, 0) AS isEmailVerified,
          (
            SELECT
              CASE
                WHEN dm.shared_thread_id IS NOT NULL AND trim(COALESCE(dm.body, '')) = '' THEN
                  'Shared post: ' || COALESCE(t.title, 'Thread #' || dm.shared_thread_id)
                WHEN dm.shared_thread_id IS NOT NULL THEN
                  'Shared post: ' || dm.body
                ELSE
                  dm.body
              END
            FROM direct_messages dm
            LEFT JOIN threads t ON t.id = dm.shared_thread_id
            WHERE (
              (dm.sender_user_id = ? AND dm.recipient_user_id = u.id)
              OR (dm.sender_user_id = u.id AND dm.recipient_user_id = ?)
            )
            ORDER BY datetime(dm.created_at) DESC, dm.id DESC
            LIMIT 1
          ) AS lastMessage,
          (
            SELECT dm.created_at
            FROM direct_messages dm
            WHERE (
              (dm.sender_user_id = ? AND dm.recipient_user_id = u.id)
              OR (dm.sender_user_id = u.id AND dm.recipient_user_id = ?)
            )
            ORDER BY datetime(dm.created_at) DESC, dm.id DESC
            LIMIT 1
          ) AS lastMessageAt,
          (
            SELECT COUNT(*)
            FROM direct_messages dm
            WHERE dm.sender_user_id = u.id
              AND dm.recipient_user_id = ?
              AND dm.read_at IS NULL
         ) AS unreadCount
         FROM users u
         WHERE u.id != ?
           AND (
             ? = ''
             OR lower(u.name) LIKE '%' || ? || '%'
             OR lower(u.handle) LIKE '%' || ? || '%'
           )
         ORDER BY
           CASE WHEN lastMessageAt IS NULL THEN 1 ELSE 0 END,
           datetime(lastMessageAt) DESC,
           lower(u.name) ASC`
      )
      .all(viewerId, viewerId, viewerId, viewerId, viewerId, viewerId, search, search, handleSearch)
      .map((user) => ({
        ...user,
        isEmailVerified: Boolean(user.isEmailVerified),
        unreadCount: Number(user.unreadCount)
      }));

    return res.json({ users });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not load chats' });
  }
});

router.get('/:userId', (req, res) => {
  const otherUserId = Number(req.params.userId);
  if (!Number.isInteger(otherUserId) || otherUserId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  if (otherUserId === req.authUser.id) {
    return res.status(400).json({ message: 'Cannot open a chat with yourself' });
  }

  try {
    const db = getDb();
    const otherUser = db
      .prepare(
        `SELECT
          id,
          name,
          handle,
          COALESCE(email_verified_at IS NOT NULL, 0) AS isEmailVerified
         FROM users
         WHERE id = ?`
      )
      .get(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    db.prepare(
      `UPDATE direct_messages
       SET read_at = CURRENT_TIMESTAMP
       WHERE sender_user_id = ?
         AND recipient_user_id = ?
         AND read_at IS NULL`
    ).run(otherUserId, req.authUser.id);

    const messages = db
      .prepare(
        `SELECT
          dm.id,
          dm.sender_user_id AS senderUserId,
          dm.recipient_user_id AS recipientUserId,
          dm.body,
          dm.shared_thread_id AS sharedThreadId,
          dm.created_at AS createdAt,
          dm.read_at AS readAt,
          t.title AS sharedThreadTitle,
          t.author_user_id AS sharedThreadAuthorUserId,
          b.slug AS sharedThreadBoardSlug
         FROM direct_messages dm
         LEFT JOIN threads t ON t.id = dm.shared_thread_id
         LEFT JOIN boards b ON b.id = t.board_id
         WHERE (
           (dm.sender_user_id = ? AND dm.recipient_user_id = ?)
           OR (dm.sender_user_id = ? AND dm.recipient_user_id = ?)
         )
         ORDER BY datetime(dm.created_at) ASC, dm.id ASC`
      )
      .all(req.authUser.id, otherUserId, otherUserId, req.authUser.id)
      .map(serializeMessageRow);

    return res.json({
      user: {
        id: Number(otherUser.id),
        name: otherUser.name,
        handle: otherUser.handle,
        isEmailVerified: Boolean(otherUser.isEmailVerified)
      },
      messages
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not load messages' });
  }
});

router.post('/:userId', (req, res) => {
  const otherUserId = Number(req.params.userId);
  const body = String(req.body.body || '').trim();
  const hasSharedThreadId = req.body.sharedThreadId != null && String(req.body.sharedThreadId).trim() !== '';
  const sharedThreadId = hasSharedThreadId ? Number(req.body.sharedThreadId) : null;

  if (!Number.isInteger(otherUserId) || otherUserId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  if (otherUserId === req.authUser.id) {
    return res.status(400).json({ message: 'Cannot message yourself' });
  }

  if (!body && !hasSharedThreadId) {
    return res.status(400).json({ message: 'Message body or shared post is required' });
  }

  if (body.length > 2000) {
    return res.status(400).json({ message: 'Message body must be 2000 characters or fewer' });
  }
  if (hasSharedThreadId && (!Number.isInteger(sharedThreadId) || sharedThreadId <= 0)) {
    return res.status(400).json({ message: 'Invalid shared post id' });
  }

  try {
    const db = getDb();
    const otherUser = db.prepare('SELECT id FROM users WHERE id = ?').get(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (hasSharedThreadId) {
      const thread = db.prepare('SELECT id FROM threads WHERE id = ?').get(sharedThreadId);
      if (!thread) {
        return res.status(404).json({ message: 'Shared post not found' });
      }
    }

    const result = db
      .prepare(
        `INSERT INTO direct_messages (sender_user_id, recipient_user_id, body, shared_thread_id)
         VALUES (?, ?, ?, ?)`
      )
      .run(req.authUser.id, otherUserId, body, sharedThreadId);

    const message = db
      .prepare(
        `SELECT
          dm.id,
          dm.sender_user_id AS senderUserId,
          dm.recipient_user_id AS recipientUserId,
          dm.body,
          dm.shared_thread_id AS sharedThreadId,
          dm.created_at AS createdAt,
          dm.read_at AS readAt,
          t.title AS sharedThreadTitle,
          t.author_user_id AS sharedThreadAuthorUserId,
          b.slug AS sharedThreadBoardSlug
         FROM direct_messages dm
         LEFT JOIN threads t ON t.id = dm.shared_thread_id
         LEFT JOIN boards b ON b.id = t.board_id
         WHERE dm.id = ?`
      )
      .get(result.lastInsertRowid);

    return res.status(201).json({
      message: serializeMessageRow(message)
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not send message' });
  }
});

module.exports = router;
