require('dotenv').config();
const app = require('./app');
const { initializeDb } = require('./db');

const PORT = process.env.PORT || 4000;

function bootstrap() {
  initializeDb();
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

try {
  bootstrap();
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}
