const express = require('express');
const router = express.Router();

router.get('/me', (_req, res) => {
  res.status(501).json({ message: 'Not implemented' });
});

module.exports = router;
