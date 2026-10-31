/**
 * @file auth.validator.js
 * @description Zod validation schemas for authentication request payloads,
 * including password complexity, login credentials, and Multi-Factor Authentication.
 */

const { z } = require('zod');

// Regex enforcing: at least 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special character
const strongPasswordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=[\]{};':"\\|,.<>/~`])[A-Za-z\d@$!%*?&#^()_+\-=[\]{};':"\\|,.<>/~`]{8,128}$/;

const passwordConstraint = z
  .string()
  .min(8, 'Password must contain at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(
    strongPasswordRegex,
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  );

/**
 * User registration schema
 */
const registerSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Name is required' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(80, 'Name cannot exceed 80 characters'),
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .email('Please provide a valid email address')
      .toLowerCase()
      .max(150, 'Email cannot exceed 150 characters'),
    password: passwordConstraint,
  }),
});

/**
 * User login schema
 */
const loginSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .email('Please provide a valid email address')
      .toLowerCase(),
    password: z.string({ required_error: 'Password is required' }).min(1, 'Password cannot be empty'),
  }),
});

/**
 * Token refresh schema
 */
const refreshTokenSchema = z.object({
  body: z.object({}),
});

/**
 * Change password schema
 */
const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string({ required_error: 'Current password is required' }),
    newPassword: passwordConstraint,
  }),
});

/**
 * Forgot password schema
 */
const forgotPasswordSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .email('Please provide a valid email address')
      .toLowerCase(),
  }),
});

/**
 * Reset password schema
 */
const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string({ required_error: 'Reset token is required' }).min(1),
    newPassword: passwordConstraint,
  }),
});

/**
 * Step 2 of MFA login challenge
 */
const mfaLoginStep2Schema = z.object({
  body: z.object({
    mfaToken: z.string({ required_error: 'MFA challenge token is required' }).min(1),
    code: z
      .string({ required_error: '6-digit OTP code is required' })
      .regex(/^\d{6}$/, 'OTP code must be exactly 6 numeric digits'),
  }),
});

/**
 * Verifying and enabling MFA schema
 */
const verifyMfaSchema = z.object({
  body: z.object({
    code: z
      .string({ required_error: '6-digit OTP code is required' })
      .regex(/^\d{6}$/, 'OTP code must be exactly 6 numeric digits'),
  }),
});

/**
 * Disabling MFA schema
 */
const disableMfaSchema = z.object({
  body: z.object({
    password: z.string({ required_error: 'Password is required to disable MFA' }).min(1),
  }),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  mfaLoginStep2Schema,
  verifyMfaSchema,
  disableMfaSchema,
  passwordConstraint,
};
