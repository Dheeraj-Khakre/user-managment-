/**
 * @file auth.service.js
 * @description Authentication business logic layer.
 * Implements password hashing with bcrypt, credentials validation,
 * token issuance, password resets, and session revocation.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const userRepository = require('../repositories/user.repository');
const tokenRepository = require('../repositories/token.repository');
const tokenService = require('./token.service');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { ROLES } = require('../constants/roles');

const BCRYPT_SALT_ROUNDS = 12;

class AuthService {
  /**
   * Hashes a plain-text password using bcrypt.
   * @param {string} plainPassword
   * @returns {Promise<string>}
   */
  async hashPassword(plainPassword) {
    return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
  }

  /**
   * Compares a plain password against a bcrypt hash.
   * @param {string} plainPassword
   * @param {string} hashedPassword
   * @returns {Promise<boolean>}
   */
  async comparePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Registers a new user.
   * @param {Object} input
   * @param {string} input.name
   * @param {string} input.email
   * @param {string} input.password
   * @returns {Promise<{ user: Object, tokens: { accessToken: string, refreshToken: string } }>}
   */
  async register({ name, email, password }) {
    // 1. Check if email already registered
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw ApiError.conflict('An account with this email address already exists.');
    }

    // 2. Hash password with bcrypt
    const hashedPassword = await this.hashPassword(password);

    // 3. Persist new user with default USER role and ACTIVE status
    const newUser = await userRepository.create({
      name,
      email,
      password: hashedPassword,
      role: ROLES.USER,
      status: 'ACTIVE',
    });

    // 4. Generate JWT token pair
    const accessToken = tokenService.generateAccessToken(newUser);
    const { refreshToken } = await tokenService.generateRefreshToken(newUser);

    logger.info(`New user registered successfully: [${newUser.id}] ${newUser.email}`);

    return {
      user: newUser,
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  /**
   * Authenticates user credentials and issues token pair.
   * @param {Object} input
   * @param {string} input.email
   * @param {string} input.password
   * @returns {Promise<{ user: Object, tokens: { accessToken: string, refreshToken: string } }>}
   */
  async login({ email, password }) {
    // 1. Lookup user including password hash
    const user = await userRepository.findByEmail(email, { includePassword: true });
    if (!user) {
      // Use uniform message to prevent user enumeration attacks
      throw ApiError.unauthorized('Invalid email or password.');
    }

    // 2. Check if user account is suspended
    if (user.status === 'SUSPENDED') {
      throw ApiError.forbidden('Your account has been suspended. Please contact support.');
    }

    // 3. Verify password
    const isPasswordValid = await this.comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw ApiError.unauthorized('Invalid email or password.');
    }

    // 4. Update last login timestamp
    await userRepository.update(user.id, {
      lastLoginAt: new Date().toISOString(),
    });

    const sanitizedUser = userRepository.sanitizeUser(user);

    // 5. Generate token pair
    const accessToken = tokenService.generateAccessToken(sanitizedUser);
    const { refreshToken } = await tokenService.generateRefreshToken(sanitizedUser);

    logger.info(`User logged in successfully: [${user.id}] ${user.email}`);

    return {
      user: sanitizedUser,
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  /**
   * Refreshes an expired access token using a valid refresh token.
   * Implements token rotation to mitigate replay attacks.
   * @param {string} refreshToken
   * @returns {Promise<{ tokens: { accessToken: string, refreshToken: string } }>}
   */
  async refreshToken(refreshToken) {
    const { decoded, tokenRecord } = await tokenService.verifyRefreshToken(refreshToken);

    const user = await userRepository.findById(tokenRecord.userId);
    if (!user) {
      throw ApiError.unauthorized('User associated with this token no longer exists.');
    }

    if (user.status === 'SUSPENDED') {
      throw ApiError.forbidden('Account has been suspended.');
    }

    const rotatedTokens = await tokenService.rotateRefreshToken(refreshToken, user);

    logger.debug(`Token rotated successfully for user [${user.id}]`);
    return { tokens: rotatedTokens };
  }

  /**
   * Logs out user by revoking the provided refresh token.
   * @param {string} refreshToken
   * @returns {Promise<boolean>}
   */
  async logout(refreshToken) {
    if (!refreshToken) return true;

    try {
      const tokenRecord = await tokenRepository.findByRawToken(refreshToken);
      if (tokenRecord) {
        tokenRecord.isRevoked = true;
        tokenRecord.revokedAt = new Date().toISOString();
        tokenRecord.revocationReason = 'USER_LOGOUT';
        await tokenRepository.markAsReplaced(tokenRecord.id, 'REVOKED_LOGOUT');
      }
    } catch (err) {
      logger.warn('Failed to revoke token on logout:', err);
    }

    return true;
  }

  /**
   * Changes the authenticated user's password and revokes all active sessions.
   * @param {string} userId
   * @param {Object} input
   * @param {string} input.currentPassword
   * @param {string} input.newPassword
   * @returns {Promise<boolean>}
   */
  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await userRepository.findById(userId, { includePassword: true });
    if (!user) {
      throw ApiError.notFound('User not found.');
    }

    // Verify current password
    const isCurrentValid = await this.comparePassword(currentPassword, user.password);
    if (!isCurrentValid) {
      throw ApiError.badRequest('Current password provided is incorrect.');
    }

    // Ensure new password is not identical to current
    const isSamePassword = await this.comparePassword(newPassword, user.password);
    if (isSamePassword) {
      throw ApiError.badRequest('New password must be different from the current password.');
    }

    // Hash and store new password
    const hashedNewPassword = await this.hashPassword(newPassword);
    await userRepository.updateAuthFields(userId, {
      password: hashedNewPassword,
      passwordChangedAt: new Date().toISOString(),
    });

    // Invalidate all active refresh tokens across all devices
    await tokenRepository.revokeAllUserTokens(userId);
    logger.info(`Password changed and all sessions revoked for user: [${userId}]`);

    return true;
  }

  /**
   * Initiates forgot-password workflow by generating a reset token.
   * @param {string} email
   * @returns {Promise<{ resetToken: string, message: string }>}
   */
  async forgotPassword(email) {
    const user = await userRepository.findByEmail(email);

    // Return uniform message even if user does not exist to avoid email harvesting
    const responseMsg = 'If a matching account is found, password reset instructions have been dispatched.';

    if (!user) {
      return { message: responseMsg };
    }

    const { plainToken, hashedToken, expires } = tokenService.generatePasswordResetToken();

    await userRepository.updateAuthFields(user.id, {
      passwordResetToken: hashedToken,
      passwordResetExpires: expires,
    });

    logger.info(`Password reset requested for user [${user.id}]`);

    return {
      message: responseMsg,
      // We expose plainToken here for local development and testing convenience
      resetToken: plainToken,
    };
  }

  /**
   * Completes password reset using token.
   * @param {string} plainToken
   * @param {string} newPassword
   * @returns {Promise<boolean>}
   */
  async resetPassword(plainToken, newPassword) {
    const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');
    const users = userRepository._readAll();
    const now = new Date();

    const user = users.find(
      (u) =>
        u.passwordResetToken === hashedToken &&
        new Date(u.passwordResetExpires) > now &&
        !u.isDeleted
    );

    if (!user) {
      throw ApiError.badRequest('Password reset token is invalid or has expired.');
    }

    const hashedPassword = await this.hashPassword(newPassword);

    await userRepository.updateAuthFields(user.id, {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
      passwordChangedAt: new Date().toISOString(),
    });

    // Invalidate old sessions
    await tokenRepository.revokeAllUserTokens(user.id);
    logger.info(`Password successfully reset via token for user [${user.id}]`);

    return true;
  }
}

module.exports = new AuthService();
