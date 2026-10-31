/**
 * @file env.config.js
 * @description Validates and exports typed environment variables at application startup.
 * Prevents the application from booting with missing, malformed, or weak security secrets.
 */

const dotenv = require('dotenv');
const path = require('path');
const { z } = require('zod');

const isOriginList = (value) => {
  const origins = value.split(',').map((origin) => origin.trim());
  return origins.length > 0 && origins.every((origin) => {
    if (!origin || origin === '*') return false;
    try {
      const parsed = new URL(origin);
      return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === origin;
    } catch {
      return false;
    }
  });
};

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
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173').refine(isOriginList, {
    message: 'CORS_ORIGIN must be a comma-separated list of exact http(s) origins; wildcards are not allowed',
  }),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().default('Nexus Control <noreply@example.com>'),

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
}).superRefine((config, context) => {
  if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    context.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'JWT secrets must be different' });
  }
  if (Boolean(config.SMTP_USER) !== Boolean(config.SMTP_PASS)) {
    context.addIssue({ code: 'custom', path: ['SMTP_USER'], message: 'SMTP_USER and SMTP_PASS must be configured together' });
  }
  if (config.NODE_ENV === 'production') {
    if (!config.SMTP_HOST) {
      context.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'SMTP_HOST is required in production for password reset delivery' });
    }
    if (new URL(config.FRONTEND_URL).protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(new URL(config.FRONTEND_URL).hostname)) {
      context.addIssue({ code: 'custom', path: ['FRONTEND_URL'], message: 'FRONTEND_URL must use HTTPS in production' });
    }
    const unsafeSecretMarkers = ['super_secret', 'change_in_production', 'session_cookie_signing_secret'];
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'COOKIE_SECRET']) {
      if (unsafeSecretMarkers.some((marker) => config[key].toLowerCase().includes(marker))) {
        context.addIssue({ code: 'custom', path: [key], message: `${key} must be replaced with a generated secret in production` });
      }
    }
  }
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
