/**
 * @file rateLimiter.middleware.js
 * @description Rate limiting middleware to protect the API from brute-force attacks and DoS.
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
  standardHeaders: true, // Return standard RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  handler: (req, res, next) => {
    next(ApiError.tooManyRequests('Too many requests from this IP. Please try again after 15 minutes.'));
  },
});

/**
 * Strict rate limiter specifically guarding authentication endpoints
 * (login, register, forgot-password, reset-password) against brute force.
 */
const authLimiter = rateLimit({
  windowMs: envConfig.AUTH_RATE_LIMIT_WINDOW_MS,
  max: envConfig.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
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
