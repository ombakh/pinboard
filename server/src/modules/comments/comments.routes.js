const express = require('express');
const router = express.Router();

router.post('/', (_req, res) => {
  res.status(501).json({ message: 'Not implemented' });
});

module.exports = router;
