/**
 * @file requestLogger.middleware.js
 * @description HTTP request logger middleware integrating Morgan with Winston.
 */

const morgan = require('morgan');
const logger = require('../utils/logger');

// Define custom stream passing output to winston
const stream = {
  write: (message) => logger.http(message.trim()),
};

// Morgan format string: :remote-addr :method :url :status :res[content-length] - :response-time ms
const morganMiddleware = morgan(
  ':remote-addr - :method :url :status :res[content-length] - :response-time ms',
  { stream }
);

module.exports = morganMiddleware;
