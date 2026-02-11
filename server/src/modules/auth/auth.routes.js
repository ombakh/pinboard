const express = require('express');
const router = express.Router();

router.post('/register', (_req, res) => {
  res.status(501).json({ message: 'Not implemented' });
});

router.post('/login', (_req, res) => {
  res.status(501).json({ message: 'Not implemented' });
});

module.exports = router;
