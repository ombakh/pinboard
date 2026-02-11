const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const apiRouter = require('./routes');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', apiRouter);

module.exports = app;
