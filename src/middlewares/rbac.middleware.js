/**
 * @file rbac.middleware.js
 * @description Role-Based Access Control (RBAC) middleware for route authorization.
 */

const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants/roles');

/**
 * Authorizes access based on allowed roles.
 * Must be placed after the `authenticate` middleware.
 *
 * @param {...string} allowedRoles - One or more authorized roles (e.g., ROLES.ADMIN, ROLES.MODERATOR)
 * @returns {import('express').RequestHandler}
 */
const requireRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('User must be authenticated before checking permissions.'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Access denied. Requires one of the following roles: [${allowedRoles.join(', ')}].`
        )
      );
    }

    next();
  };
};

/**
 * Authorizes access if the user is the resource owner OR possesses one of the bypass roles (e.g. ADMIN).
 *
 * @param {string} [idParam='id'] - The route param key representing target user ID
 * @param {...string} bypassRoles - Roles allowed to bypass resource ownership
 * @returns {import('express').RequestHandler}
 */
const requireOwnerOrRoles = (idParam = 'id', ...bypassRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('User must be authenticated.'));
    }

    const targetUserId = req.params[idParam];
    const isOwner = req.user.id === targetUserId;
    const hasBypassRole = bypassRoles.includes(req.user.role);

    if (!isOwner && !hasBypassRole) {
      return next(
        ApiError.forbidden('You do not have permission to modify or inspect another user’s account.')
      );
    }

    next();
  };
};

module.exports = {
  requireRoles,
  requireOwnerOrRoles,
};
