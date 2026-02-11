const express = require('express');
const router = express.Router();

router.get('/', (_req, res) => {
  res.status(501).json({ message: 'Not implemented' });
});

router.get('/:threadId', (_req, res) => {
  res.status(501).json({ message: 'Not implemented' });
});

router.post('/', (_req, res) => {
  res.status(501).json({ message: 'Not implemented' });
});

module.exports = router;
