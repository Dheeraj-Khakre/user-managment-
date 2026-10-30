/**
 * @file validate.middleware.js
 * @description Express middleware to validate request params, query, and body against Zod schemas.
 * Compatible with both Zod v3 and Zod v4 error structures.
 */

const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');

/**
 * Creates an Express middleware that validates incoming requests against a Zod schema.
 * @param {import('zod').ZodSchema} schema
 * @returns {import('express').RequestHandler}
 */
const validate = (schema) => {
  return async (req, res, next) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Replace with sanitized/coerced values
      if (parsed.body) req.body = parsed.body;
      if (parsed.query) req.query = parsed.query;
      if (parsed.params) req.params = parsed.params;

      return next();
    } catch (error) {
      if (error instanceof ZodError || error.name === 'ZodError') {
        // Zod v4 uses .issues, Zod v3 uses .errors
        const rawIssues = error.issues || error.errors || [];
        const errorDetails = rawIssues.map((issue) => {
          const pathStr = Array.isArray(issue.path)
            ? issue.path.join('.').replace(/^(body|query|params)\./, '')
            : 'general';
          return {
            field: pathStr,
            message: issue.message,
          };
        });

        return next(ApiError.badRequest('Validation failed for request parameters', errorDetails));
      }
      return next(error);
    }
  };
};

module.exports = validate;
