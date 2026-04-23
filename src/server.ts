import 'dotenv/config';
import app from './app.js';
import { validateEnv, config } from './utils/config.js';
import { logger } from './utils/logger.js';
import { cleanupService } from './services/cleanupService.js';
import { BIZ } from './utils/constants.js';

validateEnv();

const PORT = config.port;
const HOST = config.host;

const server = app.listen(PORT, HOST, () => {
    logger.info(`OnlineMarket Backend listening on ${HOST}:${PORT}`, {
    url: config.apiUrl,
    host: HOST,
    port: PORT,
    env: config.nodeEnv
  });

  // Start background tasks
  cleanupService.start();
});

// Graceful Shutdown
const shutdown = () => {
  logger.info('Shutting down server gracefully...');
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, BIZ.SHUTDOWN_TIMEOUT_MS);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
