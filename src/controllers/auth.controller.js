/**
 * @file auth.controller.js
 * @description Authentication controller orchestrating HTTP requests, cookie management,
 * and responses for user registration, authentication, token rotation, and password resets.
 */

const authService = require('../services/auth.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * Cookie options for the secure refresh token.
 * HttpOnly protects against XSS token theft.
 * SameSite defends against CSRF attacks.
 * Path restricts cookie dispatch to auth endpoints only.
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

    // Store refresh token in secure HttpOnly cookie
    res.cookie('refreshToken', tokens.refreshToken, getRefreshTokenCookieOptions());

    return ApiResponse.created(res, {
      user,
      accessToken: tokens.accessToken,
    }, 'User registered successfully.');
  });

  /**
   * Authenticates user and issues access & refresh tokens.
   * POST /api/v1/auth/login
   */
  login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { user, tokens } = await authService.login({ email, password });

    // Store refresh token in secure HttpOnly cookie
    res.cookie('refreshToken', tokens.refreshToken, getRefreshTokenCookieOptions());

    return ApiResponse.ok(res, {
      user,
      accessToken: tokens.accessToken,
    }, 'Logged in successfully.');
  });

  /**
   * Refreshes access token and rotates refresh token.
   * POST /api/v1/auth/refresh-token
   */
  refreshToken = asyncHandler(async (req, res) => {
    // Read from HttpOnly cookie first, then fallback to request body
    const token = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!token) {
      throw ApiError.unauthorized('Refresh token is required.');
    }

    const { tokens } = await authService.refreshToken(token);

    // Update refresh token cookie with rotated token
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

    // Clear client-side cookie
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

    // Clear old refresh cookie as all sessions were invalidated
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
