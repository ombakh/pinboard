const express = require('express');
const { getDb } = require('../../db');
const requireAuth = require('../../middlewares/requireAuth');
const { TOKEN_COOKIE_NAME, verifyUserToken } = require('../../auth/token');
const { getBoardRole } = require('../../utils/boardPermissions');
const {
  NOTIFICATION_TYPES,
  createNotification,
  createMentionNotifications
} = require('../notifications/notifications.service');

const router = express.Router();
const MAX_THREAD_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_THREAD_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);

function normalizeThreadImageDataUrl(value) {
  if (value == null) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error('Post image must be a valid image upload');
  }

  const mimeType = String(match[1] || '').toLowerCase();
  if (!ALLOWED_THREAD_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error('Post image must be PNG, JPG, WEBP, or GIF');
  }

  const base64Data = String(match[2] || '').replace(/\s+/g, '');
  const byteLength = Buffer.byteLength(base64Data, 'base64');
  if (!Number.isFinite(byteLength) || byteLength <= 0) {
    throw new Error('Post image appears invalid');
  }
  if (byteLength > MAX_THREAD_IMAGE_BYTES) {
    throw new Error('Post image must be 3MB or smaller');
  }

  return `data:${mimeType};base64,${base64Data}`;
}

function getViewerId(req) {
  const token = req.cookies[TOKEN_COOKIE_NAME];
  if (!token) {
    return null;
  }

  try {
    const payload = verifyUserToken(token);
    return payload.sub;
  } catch (_error) {
    return null;
  }
}

function mapThreadRow(thread) {
  return {
    ...thread,
    boardId: thread.boardId ? Number(thread.boardId) : null,
    responseCount: Number(thread.responseCount),
    authorEmailVerified: Boolean(thread.authorEmailVerified),
    upvotes: Number(thread.upvotes),
    downvotes: Number(thread.downvotes),
    userVote: Number(thread.userVote)
  };
}

function mapResponseRow(response) {
  return {
    ...response,
    authorEmailVerified: Boolean(response.authorEmailVerified),
    upvotes: Number(response.upvotes),
    downvotes: Number(response.downvotes),
    userVote: Number(response.userVote)
  };
}

function buildThreadSelect() {
  return `
    SELECT
      t.id,
      t.title,
      t.body,
      t.image_url AS imageUrl,
      t.board_id AS boardId,
      b.name AS boardName,
      b.slug AS boardSlug,
      t.author_name AS authorName,
      t.created_at AS createdAt,
      t.author_user_id AS authorUserId,
      COALESCE(author.email_verified_at IS NOT NULL, 0) AS authorEmailVerified,
      (
        SELECT COUNT(*)
        FROM thread_responses tr
        WHERE tr.thread_id = t.id
      ) AS responseCount,
      (
        SELECT MAX(tr.created_at)
        FROM thread_responses tr
        WHERE tr.thread_id = t.id
      ) AS lastResponseAt,
      COALESCE(
        (
          SELECT MAX(tr.created_at)
          FROM thread_responses tr
          WHERE tr.thread_id = t.id
        ),
        t.created_at
      ) AS latestActivityAt,
      COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
      COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) AS downvotes,
      MAX(CASE WHEN v.user_id = ? THEN v.vote ELSE 0 END) AS userVote
    FROM threads t
    LEFT JOIN boards b ON b.id = t.board_id
    LEFT JOIN users author ON author.id = t.author_user_id
    LEFT JOIN thread_votes v ON v.thread_id = t.id
  `;
}

function buildResponseSelect() {
  return `
    SELECT
      r.id,
      r.thread_id AS threadId,
      r.user_id AS userId,
      r.author_name AS authorName,
      COALESCE(author.email_verified_at IS NOT NULL, 0) AS authorEmailVerified,
      r.body,
      r.created_at AS createdAt,
      COALESCE(SUM(CASE WHEN rv.vote = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
      COALESCE(SUM(CASE WHEN rv.vote = -1 THEN 1 ELSE 0 END), 0) AS downvotes,
      MAX(CASE WHEN rv.user_id = ? THEN rv.vote ELSE 0 END) AS userVote
    FROM thread_responses r
    LEFT JOIN users author ON author.id = r.user_id
    LEFT JOIN response_votes rv ON rv.response_id = r.id
  `;
}

router.get('/', (_req, res) => {
  try {
    const viewerId = getViewerId(_req) || -1;
    const boardId = Number(_req.query.boardId);
    const search = String(_req.query.search || '').trim();
    const sort = String(_req.query.sort || 'new');
    const hasBoardFilter = Number.isInteger(boardId) && boardId > 0;
    const hasSearchFilter = search.length > 0;
    const db = getDb();
    const whereParts = [];
    const params = [viewerId];

    if (hasBoardFilter) {
      whereParts.push('t.board_id = ?');
      params.push(boardId);
    }
    if (hasSearchFilter) {
      whereParts.push('(t.title LIKE ? OR t.body LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    let orderClause = 'datetime(t.created_at) DESC';
    if (sort === 'top') {
      orderClause = '(upvotes - downvotes) DESC, datetime(t.created_at) DESC';
    } else if (sort === 'active') {
      orderClause = 'datetime(latestActivityAt) DESC';
    } else if (sort === 'discussed') {
      orderClause = 'responseCount DESC, datetime(t.created_at) DESC';
    }

    const threads = db
      .prepare(
        `${buildThreadSelect()}
         ${whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''}
         GROUP BY t.id
         ORDER BY ${orderClause}`
      )
      .all(...params)
      .map(mapThreadRow);
    res.json({ threads });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load threads' });
  }
});

router.get('/:threadId', (req, res) => {
  try {
    const viewerId = getViewerId(req) || -1;
    const db = getDb();
    const thread = db
      .prepare(
        `${buildThreadSelect()}
         WHERE t.id = ?
         GROUP BY t.id`
      )
      .get(viewerId, req.params.threadId);

    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    return res.json({
      thread: mapThreadRow(thread)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load thread' });
  }
});

router.post('/', requireAuth, (req, res) => {
  const title = (req.body.title || '').trim();
  const body = (req.body.body || '').trim();
  const boardId = Number(req.body.boardId);
  let imageUrl = null;
  const authorName = req.authUser.name || 'Member';
  const authorUserId = req.authUser.id;

  try {
    imageUrl = normalizeThreadImageDataUrl(req.body.imageUrl);
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Invalid post image upload' });
  }

  if (!title || !body || !Number.isInteger(boardId) || boardId <= 0) {
    return res.status(400).json({ message: 'Title, body, and board are required' });
  }

  try {
    const db = getDb();
    const boardExists = db.prepare('SELECT id FROM boards WHERE id = ?').get(boardId);
    if (!boardExists) {
      return res.status(400).json({ message: 'Selected board does not exist' });
    }

    const result = db
      .prepare(
        `INSERT INTO threads (title, body, image_url, board_id, author_name, author_user_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(title, body, imageUrl, boardId, authorName, authorUserId);

    createMentionNotifications({
      db,
      text: `${title}\n${body}`,
      actorUserId: authorUserId,
      actorName: authorName,
      entityType: 'thread',
      entityId: Number(result.lastInsertRowid),
      threadId: Number(result.lastInsertRowid),
      contextLabel: 'a thread'
    });

    const thread = db
      .prepare(
        `${buildThreadSelect()}
         WHERE t.id = ?
         GROUP BY t.id`
      )
      .get(authorUserId, result.lastInsertRowid);

    return res.status(201).json({
      thread: mapThreadRow(thread)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create thread' });
  }
});

router.post('/:threadId/vote', requireAuth, (req, res) => {
  const threadId = Number(req.params.threadId);
  const vote = Number(req.body.vote);
  const userId = req.authUser.id;

  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ message: 'Invalid thread id' });
  }

  if (vote !== 1 && vote !== -1) {
    return res.status(400).json({ message: 'Vote must be 1 or -1' });
  }

  try {
    const db = getDb();
    const threadExists = db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId);

    if (!threadExists) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    db.prepare(
      `INSERT INTO thread_votes (thread_id, user_id, vote)
       VALUES (?, ?, ?)
       ON CONFLICT(thread_id, user_id) DO UPDATE SET
         vote = excluded.vote,
         updated_at = CURRENT_TIMESTAMP`
    ).run(threadId, userId, vote);

    const thread = db
      .prepare(
        `${buildThreadSelect()}
         WHERE t.id = ?
         GROUP BY t.id`
      )
      .get(userId, threadId);

    return res.json({
      thread: mapThreadRow(thread)
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not submit vote' });
  }
});

router.delete('/:threadId', requireAuth, (req, res) => {
  const threadId = Number(req.params.threadId);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ message: 'Invalid thread id' });
  }

  try {
    const db = getDb();
    const thread = db
      .prepare('SELECT id, board_id AS boardId FROM threads WHERE id = ?')
      .get(threadId);
    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    const role = thread.boardId ? getBoardRole(db, thread.boardId, req.authUser) : null;
    if (!req.authUser.isAdmin && !(role && role.canModerateBoard)) {
      return res.status(403).json({ message: 'Board moderator or admin privileges required' });
    }

    db.prepare('DELETE FROM threads WHERE id = ?').run(threadId);
    return res.status(204).send();
  } catch (_error) {
    return res.status(500).json({ message: 'Could not delete thread' });
  }
});

router.get('/:threadId/responses', (req, res) => {
  const threadId = Number(req.params.threadId);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ message: 'Invalid thread id' });
  }

  try {
    const viewerId = getViewerId(req) || -1;
    const db = getDb();
    const exists = db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId);
    if (!exists) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    const responses = db
      .prepare(
        `${buildResponseSelect()}
         WHERE r.thread_id = ?
         GROUP BY r.id
         ORDER BY datetime(r.created_at) ASC`
      )
      .all(viewerId, threadId)
      .map(mapResponseRow);

    return res.json({ responses });
  } catch (_error) {
    return res.status(500).json({ message: 'Failed to load responses' });
  }
});

router.post('/:threadId/responses', requireAuth, (req, res) => {
  const threadId = Number(req.params.threadId);
  const body = (req.body.body || '').trim();

  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ message: 'Invalid thread id' });
  }

  if (!body) {
    return res.status(400).json({ message: 'Response body is required' });
  }

  try {
    const db = getDb();
    const thread = db
      .prepare(
        `SELECT id, title, author_user_id AS authorUserId
         FROM threads
         WHERE id = ?`
      )
      .get(threadId);
    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    const result = db
      .prepare(
        `INSERT INTO thread_responses (thread_id, user_id, author_name, body)
         VALUES (?, ?, ?, ?)`
      )
      .run(threadId, req.authUser.id, req.authUser.name, body);

    const response = db
      .prepare(
        `${buildResponseSelect()}
         WHERE r.id = ?
         GROUP BY r.id`
      )
      .get(req.authUser.id, result.lastInsertRowid);

    const notifiedUserIds = [];
    const threadAuthorId = Number(thread.authorUserId);
    if (Number.isInteger(threadAuthorId) && threadAuthorId > 0 && threadAuthorId !== req.authUser.id) {
      createNotification(db, {
        userId: threadAuthorId,
        actorUserId: req.authUser.id,
        type: NOTIFICATION_TYPES.THREAD_RESPONSE,
        entityType: 'thread_response',
        entityId: Number(result.lastInsertRowid),
        threadId,
        message: `${req.authUser.name || 'Someone'} replied to your thread`
      });
      notifiedUserIds.push(threadAuthorId);
    }

    createMentionNotifications({
      db,
      text: body,
      actorUserId: req.authUser.id,
      actorName: req.authUser.name,
      entityType: 'thread_response',
      entityId: Number(result.lastInsertRowid),
      threadId,
      excludeUserIds: notifiedUserIds,
      contextLabel: 'a reply'
    });

    return res.status(201).json({
      response: mapResponseRow(response)
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Failed to create response' });
  }
});

router.post('/:threadId/responses/:responseId/vote', requireAuth, (req, res) => {
  const threadId = Number(req.params.threadId);
  const responseId = Number(req.params.responseId);
  const vote = Number(req.body.vote);
  const userId = req.authUser.id;

  if (!Number.isInteger(threadId) || threadId <= 0) {
    return res.status(400).json({ message: 'Invalid thread id' });
  }

  if (!Number.isInteger(responseId) || responseId <= 0) {
    return res.status(400).json({ message: 'Invalid response id' });
  }

  if (vote !== 1 && vote !== -1) {
    return res.status(400).json({ message: 'Vote must be 1 or -1' });
  }

  try {
    const db = getDb();
    const responseExists = db
      .prepare('SELECT id FROM thread_responses WHERE id = ? AND thread_id = ?')
      .get(responseId, threadId);

    if (!responseExists) {
      return res.status(404).json({ message: 'Response not found' });
    }

    db.prepare(
      `INSERT INTO response_votes (response_id, user_id, vote)
       VALUES (?, ?, ?)
       ON CONFLICT(response_id, user_id) DO UPDATE SET
         vote = excluded.vote,
         updated_at = CURRENT_TIMESTAMP`
    ).run(responseId, userId, vote);

    const response = db
      .prepare(
        `${buildResponseSelect()}
         WHERE r.id = ?
         GROUP BY r.id`
      )
      .get(userId, responseId);

    return res.json({
      response: mapResponseRow(response)
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not submit response vote' });
  }
});

module.exports = router;
