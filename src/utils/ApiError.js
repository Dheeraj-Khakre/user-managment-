/**
 * @file ApiError.js
 * @description Custom operational error class for centralized, predictable error handling.
 */

const { HTTP_STATUS } = require('../constants/httpStatusCodes');

class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code.
   * @param {string} message - Descriptive error message.
   * @param {Array|Object} [errors=[]] - Array of validation or detailed error issues.
   * @param {string} [stack=''] - Optional stack trace override.
   * @param {boolean} [isOperational=true] - Distinguishes expected operational errors from programming bugs.
   */
  constructor(
    statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    message = 'An unexpected error occurred',
    errors = [],
    stack = '',
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.data = null;
    this.message = message;
    this.success = false;
    this.errors = errors;
    this.isOperational = isOperational;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  // Common error factory helpers
  static badRequest(message, errors = []) {
    return new ApiError(HTTP_STATUS.BAD_REQUEST, message, errors);
  }

  static unauthorized(message = 'Unauthorized access. Authentication token is missing or invalid.') {
    return new ApiError(HTTP_STATUS.UNAUTHORIZED, message);
  }

  static forbidden(message = 'Forbidden. You do not have permission to access this resource.') {
    return new ApiError(HTTP_STATUS.FORBIDDEN, message);
  }

  static notFound(message = 'Requested resource not found.') {
    return new ApiError(HTTP_STATUS.NOT_FOUND, message);
  }

  static conflict(message = 'Resource conflict detected.') {
    return new ApiError(HTTP_STATUS.CONFLICT, message);
  }

  static tooManyRequests(message = 'Rate limit exceeded. Please try again later.') {
    return new ApiError(HTTP_STATUS.TOO_MANY_REQUESTS, message);
  }

  static internal(message = 'Internal server error occurred.', errors = []) {
    return new ApiError(HTTP_STATUS.INTERNAL_SERVER_ERROR, message, errors, '', false);
  }
}

module.exports = ApiError;
