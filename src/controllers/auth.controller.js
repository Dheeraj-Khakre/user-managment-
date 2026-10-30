/**
 * @file auth.controller.js
 * @description Authentication controller orchestrating HTTP requests, cookie management,
 * and responses for user registration, authentication, token rotation, MFA, and password resets.
 */

const authService = require('../services/auth.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * Cookie options for the secure refresh token.
 */
const getRefreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
});

class AuthController {
  /**
   * Registers a new user.
   * POST /api/v1/auth/register
   */
  register = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const { user, tokens } = await authService.register({ name, email, password });

    res.cookie('refreshToken', tokens.refreshToken, getRefreshTokenCookieOptions());

    return ApiResponse.created(res, {
      user,
      accessToken: tokens.accessToken,
    }, 'User registered successfully.');
  });

  /**
   * Authenticates user and issues access & refresh tokens (or prompts for MFA).
   * POST /api/v1/auth/login
   */
  login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });

    // Handle MFA Challenge
    if (result.mfaRequired) {
      return ApiResponse.ok(res, {
        mfaRequired: true,
        mfaToken: result.mfaToken,
      }, result.message);
    }

    // Set refresh token in secure HttpOnly cookie
    res.cookie('refreshToken', result.tokens.refreshToken, getRefreshTokenCookieOptions());

    return ApiResponse.ok(res, {
      user: result.user,
      accessToken: result.tokens.accessToken,
    }, 'Logged in successfully.');
  });

  /**
   * Step 2 of MFA Login: Verifies TOTP code and issues tokens.
   * POST /api/v1/auth/mfa/login-step2
   */
  verifyMfaLogin = asyncHandler(async (req, res) => {
    const { mfaToken, code } = req.body;
    const { user, tokens } = await authService.verifyMfaLogin({ mfaToken, code });

    res.cookie('refreshToken', tokens.refreshToken, getRefreshTokenCookieOptions());

    return ApiResponse.ok(res, {
      user,
      accessToken: tokens.accessToken,
    }, 'MFA authentication successful. Logged in.');
  });

  /**
   * Initiates MFA setup by generating a secret and otpauth URL.
   * POST /api/v1/auth/mfa/setup
   */
  setupMfa = asyncHandler(async (req, res) => {
    const result = await authService.setupMfa(req.user.id);
    return ApiResponse.ok(res, result, 'MFA secret generated. Scan QR or enter secret in your authenticator app.');
  });

  /**
   * Confirms initial TOTP code to activate MFA.
   * POST /api/v1/auth/mfa/verify
   */
  verifyMfa = asyncHandler(async (req, res) => {
    const { code } = req.body;
    await authService.verifyAndEnableMfa(req.user.id, code);
    return ApiResponse.ok(res, null, 'Multi-Factor Authentication enabled successfully.');
  });

  /**
   * Disables MFA on authenticated user account.
   * POST /api/v1/auth/mfa/disable
   */
  disableMfa = asyncHandler(async (req, res) => {
    const { password } = req.body;
    await authService.disableMfa(req.user.id, password);
    return ApiResponse.ok(res, null, 'Multi-Factor Authentication has been disabled.');
  });

  /**
   * Refreshes access token and rotates refresh token.
   * POST /api/v1/auth/refresh-token
   */
  refreshToken = asyncHandler(async (req, res) => {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!token) {
      throw ApiError.unauthorized('Refresh token is required.');
    }

    const { tokens } = await authService.refreshToken(token);
    res.cookie('refreshToken', tokens.refreshToken, getRefreshTokenCookieOptions());

    return ApiResponse.ok(res, {
      accessToken: tokens.accessToken,
    }, 'Access token refreshed successfully.');
  });

  /**
   * Logs out user by revoking refresh token and clearing cookie.
   * POST /api/v1/auth/logout
   */
  logout = asyncHandler(async (req, res) => {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;

    if (token) {
      await authService.logout(token);
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
    });

    return ApiResponse.ok(res, null, 'Logged out successfully.');
  });

  /**
   * Retrieves profile of currently authenticated user.
   * GET /api/v1/auth/me
   */
  getMe = asyncHandler(async (req, res) => {
    return ApiResponse.ok(res, req.user, 'Current user profile fetched.');
  });

  /**
   * Changes authenticated user password.
   * POST /api/v1/auth/change-password
   */
  changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, { currentPassword, newPassword });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
    });

    return ApiResponse.ok(res, null, 'Password changed successfully. Please login again with your new password.');
  });

  /**
   * Initiates forgot password flow.
   * POST /api/v1/auth/forgot-password
   */
  forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const result = await authService.forgotPassword(email);
    return ApiResponse.ok(res, result, 'Password reset instructions generated.');
  });

  /**
   * Resets password using token.
   * POST /api/v1/auth/reset-password
   */
  resetPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    await authService.resetPassword(token, newPassword);
    return ApiResponse.ok(res, null, 'Password has been successfully reset. You may now log in.');
  });
}

module.exports = new AuthController();
