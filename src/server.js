/**
 * @file server.js
 * @description HTTP server entry point handling startup lifecycle, port binding,
 * unhandled exceptions, and graceful process shutdown.
 */

const http = require('http');
const app = require('./app');
const envConfig = require('./config/env.config');
const logger = require('./utils/logger');

// Catch any synchronous uncaught errors before startup
process.on('uncaughtException', (error) => {
  logger.error('CRITICAL: Uncaught Exception caught by process handler:', error);
  process.exit(1);
});

const server = http.createServer(app);

server.listen(envConfig.PORT, () => {
  logger.info(`🚀 Server running in [${envConfig.NODE_ENV}] mode on http://${envConfig.HOST}:${envConfig.PORT}`);
  logger.info(`🛡️  Security layers initialized: Helmet, CORS, RateLimiting, HPP, Zod Validation`);
  logger.info(`🔍 Health check available at: http://${envConfig.HOST}:${envConfig.PORT}/api/v1/health`);
});

// Handle unhandled Promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection at:', {
    message: reason?.message || String(reason),
    stack: reason?.stack || null,
  });
  // Graceful shutdown after finishing current request
  server.close(() => {
    process.exit(1);
  });
});

/**
 * Graceful termination handler for SIGINT (Ctrl+C) and SIGTERM (container shutdown)
 */
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);
  server.close(() => {
    logger.info('HTTP server closed. Exiting process safely.');
    process.exit(0);
  });

  // Force exit after 10 seconds if hanging connections persist
  setTimeout(() => {
    logger.error('Forced shutdown invoked due to hung connections.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
