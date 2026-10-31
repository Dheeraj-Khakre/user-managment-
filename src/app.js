/**
 * @file app.js
 * @description Express application setup integrating end-to-end security middlewares,
 * body parsers, cookie helpers, request logging, Swagger UI, and route mounting.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const envConfig = require('./config/env.config');
const ApiError = require('./utils/ApiError');
const apiRoutes = require('./routes');
const { swaggerUi, swaggerSpec } = require('./docs/swagger');
const morganMiddleware = require('./middlewares/requestLogger.middleware');
const { apiLimiter } = require('./middlewares/rateLimiter.middleware');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');

const app = express();

// 1. Trust first proxy if running behind reverse proxy
app.set('trust proxy', envConfig.TRUST_PROXY_HOPS);

// 2. Helmet - Sets comprehensive security HTTP response headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// 3. CORS - Cross-Origin Resource Sharing with strict origin verification
const allowedOrigins = envConfig.CORS_ORIGIN.split(',').map((origin) => origin.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(ApiError.forbidden('Request origin is not allowed.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Step-Up-Token'],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    maxAge: 86400,
  })
);

// 4. Request body size limiting
app.use(express.json({ limit: '15kb' }));
app.use(express.urlencoded({ extended: true, limit: '15kb' }));

// 5. Secure cookie parser
app.use(cookieParser(envConfig.COOKIE_SECRET));

// 6. HTTP Parameter Pollution protection
app.use(hpp());

// 7. HTTP request logging via Morgan + Winston
if (process.env.NODE_ENV !== 'test') {
  app.use(morganMiddleware);
}

// 8. Swagger Interactive Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/docs', (req, res) => res.redirect('/api-docs'));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// 9. General rate limiter applied across all API endpoints (skipped in test mode)
if (process.env.NODE_ENV !== 'test') {
  app.use('/api', apiLimiter);
}

// 10. Mount main API routes
app.use('/api/v1', apiRoutes);

// 11. Root landing endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'Secure User Management API',
    version: 'v1.0.0',
    documentation: '/api-docs',
    healthCheck: '/api/v1/health',
  });
});

// 12. 404 handler for unmatched routes
app.use(notFoundHandler);

// 13. Centralized error handling middleware
app.use(errorHandler);

module.exports = app;
