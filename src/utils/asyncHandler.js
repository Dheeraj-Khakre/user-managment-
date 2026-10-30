/**
 * @file asyncHandler.js
 * @description Higher-order function wrapping async route handlers to automatically
 * forward any caught rejected promises to Express's next() error-handling middleware.
 *
 * @param {Function} executionHandler - Async controller function (req, res, next)
 * @returns {import('express').RequestHandler}
 */
const asyncHandler = (executionHandler) => {
  return (req, res, next) => {
    Promise.resolve(executionHandler(req, res, next)).catch((err) => next(err));
  };
};

module.exports = asyncHandler;
