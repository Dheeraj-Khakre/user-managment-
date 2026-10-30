/**
 * @file error.middleware.js
 * @description Centralized Express error-handling middleware.
 * Standardizes error responses, logs unexpected server failures,
 * and masks sensitive stack traces in production environments.
 */

const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { HTTP_STATUS } = require('../constants/httpStatusCodes');

/**
 * Express error middleware.
 *
 * @param {Error|ApiError} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const errorHandler = (err, req, res, next) => {
  let error = err;

  // Handle malformed JSON body errors sent by express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    error = ApiError.badRequest('Malformed JSON body provided.');
  }

  // If not an instance of ApiError, convert to generic internal server error
  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const message = error.message || 'An unexpected internal error occurred';
    error = new ApiError(statusCode, message, [], err.stack, false);
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // Log non-operational (programming or system) errors
  if (!error.isOperational) {
    logger.error('Unhandled internal error:', {
      message: error.message,
      stack: error.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
    });
  }

  const responsePayload = {
    success: false,
    statusCode: error.statusCode,
    message: error.message,
    errors: error.errors || [],
    ...(!isProduction && { stack: error.stack }),
  };

  res.status(error.statusCode).json(responsePayload);
};

/**
 * 404 Not Found fallback handler for unmatched routes.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const notFoundHandler = (req, res, next) => {
  next(ApiError.notFound(`Cannot ${req.method} ${req.originalUrl}`));
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
