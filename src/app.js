/**
 * @file app.js
 * @description Express application setup integrating end-to-end security middlewares,
 * body parsers, cookie helpers, request logging, and route mounting.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const envConfig = require('./config/env.config');
const apiRoutes = require('./routes');
const morganMiddleware = require('./middlewares/requestLogger.middleware');
const { apiLimiter } = require('./middlewares/rateLimiter.middleware');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');

const app = express();

// 1. Trust first proxy if running behind reverse proxy (e.g. Nginx, Cloudflare, AWS ALB)
app.set('trust proxy', 1);

// 2. Helmet - Sets comprehensive security HTTP response headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
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
      // Allow requests with no origin (like mobile apps, curl, server-to-server) or in whitelist
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked request from origin: ${origin}`));
    },
    credentials: true, // Allow transmitting HttpOnly cookies across origins
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    maxAge: 86400, // 24 hours preflight cache
  })
);

// 4. Request body size limiting to prevent payload flood / denial of service
app.use(express.json({ limit: '15kb' }));
app.use(express.urlencoded({ extended: true, limit: '15kb' }));

// 5. Secure cookie parser
app.use(cookieParser(envConfig.COOKIE_SECRET));

// 6. HTTP Parameter Pollution protection
app.use(hpp());

// 7. HTTP request logging via Morgan + Winston
app.use(morganMiddleware);

// 8. General rate limiter applied across all API endpoints
app.use('/api', apiLimiter);

// 9. Mount main API routes
app.use('/api/v1', apiRoutes);

// 10. Root landing endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'Secure User Management API',
    version: 'v1.0.0',
    documentation: '/README.md',
    healthCheck: '/api/v1/health',
  });
});

// 11. 404 handler for unmatched routes
app.use(notFoundHandler);

// 12. Centralized error handling middleware
app.use(errorHandler);

module.exports = app;
