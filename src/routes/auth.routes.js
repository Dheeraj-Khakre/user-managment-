/**
 * @file auth.routes.js
 * @description Authentication routing layer configuring rate limiting, validation schemas,
 * MFA endpoints, and controller actions.
 */

const express = require('express');
const authController = require('../controllers/auth.controller');
const validate = require('../middlewares/validate.middleware');
const { authenticate } = require('../middlewares/auth.middleware');
const { authLimiter } = require('../middlewares/rateLimiter.middleware');
const { requireStepUp } = require('../middlewares/step-up.middleware');
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  mfaLoginStep2Schema,
  verifyMfaSchema,
  disableMfaSchema,
  requestStepUpOtpSchema,
  verifyStepUpSchema,
} = require('../validators/auth.validator');

const router = express.Router();

// Public routes with brute-force rate limiting
router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh-token', validate(refreshTokenSchema), authController.refreshToken);
router.post('/logout', authController.logout);
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);

// MFA Login Challenge Step 2
router.post('/mfa/login-step2', authLimiter, validate(mfaLoginStep2Schema), authController.verifyMfaLogin);

// Protected routes requiring valid JWT access token
router.get('/me', authenticate, authController.getMe);
router.post('/security/otp', authLimiter, authenticate, validate(requestStepUpOtpSchema), authController.requestStepUpOtp);
router.post('/security/verify', authLimiter, authenticate, validate(verifyStepUpSchema), authController.verifyStepUp);
router.post('/change-password', authenticate, requireStepUp('password_change'), validate(changePasswordSchema), authController.changePassword);

// MFA Management (Authenticated)
router.post('/mfa/setup', authenticate, requireStepUp('mfa_manage'), authController.setupMfa);
router.post('/mfa/verify', authenticate, requireStepUp('mfa_manage'), validate(verifyMfaSchema), authController.verifyMfa);
router.post('/mfa/disable', authenticate, requireStepUp('mfa_manage'), validate(disableMfaSchema), authController.disableMfa);

module.exports = router;
