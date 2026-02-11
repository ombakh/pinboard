const express = require('express');
const { getDb } = require('../../db');
const requireAuth = require('../../middlewares/requireAuth');

const router = express.Router();

router.get('/me', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const user = db
      .prepare(
        `SELECT id, name, email, created_at AS createdAt
         FROM users
         WHERE id = ?`
      )
      .get(req.user.sub);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({ user });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not load user profile' });
  }
});

module.exports = router;
