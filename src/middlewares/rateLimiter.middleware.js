/**
 * @file rateLimiter.middleware.js
 * @description Rate limiting middleware protecting against brute-force and DoS attacks.
 */

const rateLimit = require('express-rate-limit');
const envConfig = require('../config/env.config');
const ApiError = require('../utils/ApiError');

/**
 * Standard rate limiter for all general API routes.
 */
const apiLimiter = rateLimit({
  windowMs: envConfig.RATE_LIMIT_WINDOW_MS,
  max: envConfig.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (process.env.NODE_ENV === 'test') {
      return req.headers['x-test-rate-limit'] !== 'true';
    }
    return false;
  },
  handler: (req, res, next) => {
    next(ApiError.tooManyRequests('Too many requests from this IP. Please try again after 15 minutes.'));
  },
});

/**
 * Strict rate limiter guarding sensitive authentication routes.
 */
const authLimiter = rateLimit({
  windowMs: envConfig.AUTH_RATE_LIMIT_WINDOW_MS,
  max: envConfig.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // In test environment, only enforce when x-test-rate-limit header is set
    if (process.env.NODE_ENV === 'test') {
      return req.headers['x-test-rate-limit'] !== 'true';
    }
    return false;
  },
  handler: (req, res, next) => {
    next(
      ApiError.tooManyRequests(
        'Too many authentication attempts from this IP. Please slow down and try again later.'
      )
    );
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
};
