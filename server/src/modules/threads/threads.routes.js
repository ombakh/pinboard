const express = require('express');
const { getDb } = require('../../db');
const requireAuth = require('../../middlewares/requireAuth');

const router = express.Router();

router.get('/', (_req, res) => {
  try {
    const db = getDb();
    const threads = db
      .prepare(
        `SELECT id, title, body, author_name AS authorName, created_at AS createdAt
         FROM threads
         ORDER BY datetime(created_at) DESC`
      )
      .all();
    res.json({ threads });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load threads' });
  }
});

router.get('/:threadId', (req, res) => {
  try {
    const db = getDb();
    const thread = db
      .prepare(
        `SELECT id, title, body, author_name AS authorName, created_at AS createdAt
         FROM threads
         WHERE id = ?`
      )
      .get(req.params.threadId);

    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    return res.json({ thread });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load thread' });
  }
});

router.post('/', requireAuth, (req, res) => {
  const title = (req.body.title || '').trim();
  const body = (req.body.body || '').trim();
  const authorName = req.user.name || 'Member';

  if (!title || !body) {
    return res.status(400).json({ message: 'Title and body are required' });
  }

  try {
    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO threads (title, body, author_name)
         VALUES (?, ?, ?)`
      )
      .run(title, body, authorName);

    const thread = db
      .prepare(
        `SELECT id, title, body, author_name AS authorName, created_at AS createdAt
         FROM threads
         WHERE id = ?`
      )
      .get(result.lastInsertRowid);

    return res.status(201).json({ thread });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create thread' });
  }
});

module.exports = router;
