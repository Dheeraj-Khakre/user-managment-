/**
 * @file env.config.js
 * @description Validates and exports typed environment variables at application startup.
 * Prevents the application from booting with missing, malformed, or weak security secrets.
 */

const dotenv = require('dotenv');
const path = require('path');
const { z } = require('zod');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Zod schema defining the required environment variables and their constraints.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  HOST: z.string().default('localhost'),

  // Security - Origins allowed for Cross-Origin Resource Sharing
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173'),

  // JWT configuration - Enforces minimum 32 character entropy for signature security
  JWT_ACCESS_SECRET: z.string().min(32, {
    message: 'JWT_ACCESS_SECRET must be at least 32 characters long for security',
  }),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, {
    message: 'JWT_REFRESH_SECRET must be at least 32 characters long for security',
  }),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Signed cookie secret
  COOKIE_SECRET: z.string().min(16, {
    message: 'COOKIE_SECRET must be at least 16 characters long',
  }),

  // Rate Limiting settings
  RATE_LIMIT_WINDOW_MS: z.coerce.number().positive().default(15 * 60 * 1000), // 15 mins
  RATE_LIMIT_MAX: z.coerce.number().positive().default(100),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().positive().default(15 * 60 * 1000), // 15 mins
  AUTH_RATE_LIMIT_MAX: z.coerce.number().positive().default(15),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),

  // Persistence directory
  DATA_DIR: z.string().default('./data'),
});

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Environment configuration validation failed:');
  console.error(JSON.stringify(parseResult.error.format(), null, 2));
  process.exit(1);
}

/**
 * Validated environment configuration object.
 */
const envConfig = Object.freeze(parseResult.data);

module.exports = envConfig;
