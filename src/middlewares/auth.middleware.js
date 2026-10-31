/**
 * @file auth.middleware.js
 * @description Authentication guard middleware. Extracts and validates JWT access tokens
 * from the HTTP Authorization header (Bearer) or signed HttpOnly cookies.
 */

const tokenService = require('../services/token.service');
const userRepository = require('../repositories/user.repository');
const ApiError = require('../utils/ApiError');

/**
 * Extracts JWT token from Authorization header or cookie.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
const extractToken = (req) => {
  // 1. Check Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // 2. Fallback to signed cookie if present
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }

  return null;
};

/**
 * Middleware that authenticates requests via JWT access token.
 * Attaches the verified user record to req.user.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const authenticate = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      throw ApiError.unauthorized('Authentication token is required to access this resource.');
    }

    // Verify token cryptographic signature and expiration
    const decoded = tokenService.verifyAccessToken(token);

    // Verify user still exists in database
    const userRecord = await userRepository.findById(decoded.sub, { includePassword: true });
    if (!userRecord) {
      throw ApiError.unauthorized('User associated with this token no longer exists.');
    }

    if ((decoded.pwdv ?? null) !== (userRecord.passwordChangedAt ?? null)) {
      throw ApiError.unauthorized('Session has been invalidated. Please log in again.');
    }

    // Check account status
    if (userRecord.status === 'SUSPENDED') {
      throw ApiError.forbidden('Your account has been suspended. Please contact administration.');
    }

    // Attach authenticated user to request context
    req.user = userRepository.sanitizeUser(userRecord);
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticate,
  extractToken,
};
