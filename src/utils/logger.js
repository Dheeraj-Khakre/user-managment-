/**
 * @file logger.js
 * @description Enterprise-grade structured logging using Winston.
 * Supports colored console logs in development and structured JSON in production,
 * alongside automatic file rotation for error and combined logs.
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure log directory exists
const logDirectory = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

/**
 * Custom format for Winston console output.
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `[${timestamp}] [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

/**
 * JSON format for persistent file logs.
 */
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: logLevel,
  format: fileFormat,
  defaultMeta: { service: 'user-management-api' },
  transports: [
    // Standard error log file
    new winston.transports.File({
      filename: path.join(logDirectory, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    // Combined activity log file
    new winston.transports.File({
      filename: path.join(logDirectory, 'combined.log'),
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 7,
    }),
  ],
});

// Add console output in all non-production modes, or formatted in production
logger.add(
  new winston.transports.Console({
    format: isProduction ? fileFormat : consoleFormat,
  })
);

module.exports = logger;
