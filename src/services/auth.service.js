/**
 * @file auth.service.js
 * @description Authentication business logic layer.
 * Implements password hashing with bcrypt, account lockout protection against brute-force,
 * Multi-Factor Authentication (MFA/TOTP), session issuance, and credential rotation.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const userRepository = require('../repositories/user.repository');
const tokenRepository = require('../repositories/token.repository');
const tokenService = require('./token.service');
const emailService = require('./email.service');
const totpUtil = require('../utils/totp');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { ROLES } = require('../constants/roles');
const { HTTP_STATUS } = require('../constants/httpStatusCodes');

const BCRYPT_SALT_ROUNDS = 12;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), BCRYPT_SALT_ROUNDS);

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
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw ApiError.conflict('An account with this email address already exists.');
    }

    const hashedPassword = await this.hashPassword(password);

    const newUser = await userRepository.create({
      name,
      email,
      password: hashedPassword,
      role: ROLES.USER,
      status: 'ACTIVE',
    });

    const accessToken = tokenService.generateAccessToken(newUser, newUser.passwordChangedAt);
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
   * Authenticates user credentials with Account Lockout and MFA checks.
   * @param {Object} input
   * @param {string} input.email
   * @param {string} input.password
   * @returns {Promise<Object>}
   */
  async login({ email, password }) {
    const user = await userRepository.findByEmail(email, { includePassword: true });
    if (!user) {
      await this.comparePassword(password, DUMMY_PASSWORD_HASH);
      throw ApiError.unauthorized('Invalid email or password.');
    }

    // 1. Account Lockout Check
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      const remainingMinutes = Math.ceil((new Date(user.lockUntil) - new Date()) / 60000);
      throw new ApiError(
        HTTP_STATUS.UNAUTHORIZED,
        `Account is temporarily locked due to consecutive failed login attempts. Please try again in ${remainingMinutes} minute(s).`
      );
    }

    // 2. Account Status Check
    if (user.status === 'SUSPENDED') {
      throw ApiError.forbidden('Your account has been suspended. Please contact support.');
    }

    // 3. Password Verification
    const isPasswordValid = await this.comparePassword(password, user.password);
    if (!isPasswordValid) {
      const lockStatus = await userRepository.incrementFailedLoginAttempts(user.id);
      if (lockStatus.isLocked) {
        logger.warn(`Account locked due to 5 consecutive failed logins: [${user.id}] ${user.email}`);
        throw new ApiError(
          HTTP_STATUS.UNAUTHORIZED,
          'Account has been temporarily locked for 15 minutes due to 5 consecutive failed login attempts.'
        );
      }
      throw ApiError.unauthorized('Invalid email or password.');
    }

    // 4. Successful credentials verification -> Reset failed attempts
    await userRepository.resetFailedLoginAttempts(user.id);

    // Update last login timestamp
    await userRepository.update(user.id, {
      lastLoginAt: new Date().toISOString(),
    });

    const sanitizedUser = userRepository.sanitizeUser(user);

    // 5. Multi-Factor Authentication (MFA) Check
    if (user.mfaEnabled) {
      const mfaToken = tokenService.generateMfaToken(sanitizedUser, user.passwordChangedAt);
      logger.info(`MFA verification required for user [${user.id}] ${user.email}`);
      return {
        mfaRequired: true,
        mfaToken,
        message: 'MFA challenge required. Please provide your 6-digit TOTP code.',
      };
    }

    // 6. Generate final tokens if MFA not required
    const accessToken = tokenService.generateAccessToken(sanitizedUser, user.passwordChangedAt);
    const { refreshToken } = await tokenService.generateRefreshToken(sanitizedUser);

    logger.info(`User logged in successfully: [${user.id}] ${user.email}`);

    return {
      mfaRequired: false,
      user: sanitizedUser,
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  /**
   * Completes Step 2 of MFA login by verifying TOTP code against user's secret.
   * @param {Object} input
   * @param {string} input.mfaToken - Challenge token from Step 1
   * @param {string} input.code - 6-digit TOTP code
   * @returns {Promise<{ user: Object, tokens: { accessToken: string, refreshToken: string } }>}
   */
  async verifyMfaLogin({ mfaToken, code }) {
    const decoded = tokenService.verifyMfaToken(mfaToken);
    const user = await userRepository.findById(decoded.sub, { includePassword: true });

    if (!user || user.isDeleted || user.status === 'SUSPENDED') {
      throw ApiError.unauthorized('User session is invalid or user has been disabled.');
    }

    if ((decoded.pwdv ?? null) !== (user.passwordChangedAt ?? null)) {
      throw ApiError.unauthorized('MFA verification session is no longer valid. Please login again.');
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      throw ApiError.badRequest('MFA is not enabled on this account.');
    }

    const isValidCode = totpUtil.verifyCode(user.mfaSecret, code);
    if (!isValidCode) {
      throw ApiError.unauthorized('Invalid MFA verification code.');
    }

    const sanitizedUser = userRepository.sanitizeUser(user);
    const accessToken = tokenService.generateAccessToken(sanitizedUser, user.passwordChangedAt);
    const { refreshToken } = await tokenService.generateRefreshToken(sanitizedUser);

    logger.info(`User successfully completed MFA login: [${user.id}] ${user.email}`);

    return {
      user: sanitizedUser,
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  /**
   * Generates a new MFA secret and setup URL for the authenticated user.
   * @param {string} userId
   * @returns {Promise<{ secret: string, otpAuthUrl: string }>}
   */
  async setupMfa(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found.');
    }

    if (user.mfaEnabled) {
      throw ApiError.conflict('MFA is already enabled. Disable it with your password before setting it up again.');
    }

    const secret = totpUtil.generateSecret();
    await userRepository.setMfaSecret(userId, secret);

    const otpAuthUrl = totpUtil.getOtpAuthUrl(user.email, secret);
    logger.info(`MFA setup initiated for user [${userId}]`);

    return {
      secret,
      otpAuthUrl,
    };
  }

  /**
   * Verifies initial TOTP code to confirm and activate MFA.
   * @param {string} userId
   * @param {string} code
   * @returns {Promise<boolean>}
   */
  async verifyAndEnableMfa(userId, code) {
    const user = await userRepository.findById(userId, { includePassword: true });
    if (!user || !user.mfaSecret) {
      throw ApiError.badRequest('Please initiate MFA setup before verification.');
    }

    const isValid = totpUtil.verifyCode(user.mfaSecret, code);
    if (!isValid) {
      throw ApiError.badRequest('Invalid verification code. Please check your authenticator app.');
    }

    await userRepository.enableMfa(userId);
    logger.info(`MFA successfully activated for user [${userId}]`);
    return true;
  }

  /**
   * Disables MFA on authenticated user account (requires password verification).
   * @param {string} userId
   * @param {string} password
   * @returns {Promise<boolean>}
   */
  async disableMfa(userId, password) {
    const user = await userRepository.findById(userId, { includePassword: true });
    if (!user) {
      throw ApiError.notFound('User not found.');
    }

    const isPasswordValid = await this.comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw ApiError.unauthorized('Incorrect password. MFA could not be disabled.');
    }

    await userRepository.disableMfa(userId);
    logger.info(`MFA disabled for user [${userId}]`);
    return true;
  }

  /**
   * Refreshes access token with rotation and replay defense.
   * @param {string} refreshToken
   * @returns {Promise<{ tokens: { accessToken: string, refreshToken: string } }>}
   */
  async refreshToken(refreshToken) {
    const { tokenRecord } = await tokenService.verifyRefreshToken(refreshToken);

    const userRecord = await userRepository.findById(tokenRecord.userId, { includePassword: true });
    if (!userRecord) {
      throw ApiError.unauthorized('User associated with this token no longer exists.');
    }

    if (userRecord.status === 'SUSPENDED') {
      throw ApiError.forbidden('Account has been suspended.');
    }

    const user = userRepository.sanitizeUser(userRecord);
    const rotatedTokens = await tokenService.rotateRefreshToken(refreshToken, user, userRecord.passwordChangedAt);
    logger.debug(`Token rotated successfully for user [${user.id}]`);
    return { tokens: rotatedTokens };
  }

  /**
   * Logs out user and invalidates refresh token.
   * @param {string} refreshToken
   * @returns {Promise<boolean>}
   */
  async logout(refreshToken) {
    if (!refreshToken) return true;

    try {
      const tokenRecord = await tokenRepository.findByRawToken(refreshToken);
      if (tokenRecord) {
        await tokenRepository.markAsReplaced(tokenRecord.id, 'REVOKED_LOGOUT');
      }
    } catch (err) {
      logger.warn('Failed to revoke token on logout:', err);
    }

    return true;
  }

  /**
   * Changes authenticated user password and invalidates all existing sessions.
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

    const isCurrentValid = await this.comparePassword(currentPassword, user.password);
    if (!isCurrentValid) {
      throw ApiError.badRequest('Current password provided is incorrect.');
    }

    const isSamePassword = await this.comparePassword(newPassword, user.password);
    if (isSamePassword) {
      throw ApiError.badRequest('New password must be different from current password.');
    }

    const hashedNewPassword = await this.hashPassword(newPassword);
    await userRepository.updateAuthFields(userId, {
      password: hashedNewPassword,
      passwordChangedAt: new Date().toISOString(),
    });

    // Revoke all refresh tokens
    await tokenRepository.revokeAllUserTokens(userId);
    logger.info(`Password changed and all sessions revoked for user: [${userId}]`);

    return true;
  }

  /**
   * Generates a password reset token.
   * @param {string} email
   * @returns {Promise<{ message: string, resetToken?: string }>}
   */
  async forgotPassword(email) {
    const user = await userRepository.findByEmail(email);
    const responseMsg = 'If a matching account is found, password reset instructions have been dispatched.';

    if (!user || !emailService.isConfigured()) {
      if (user) logger.warn('Password reset requested but email delivery is not configured.');
      return { message: responseMsg };
    }

    const { plainToken, hashedToken, expires } = tokenService.generatePasswordResetToken();

    await userRepository.updateAuthFields(user.id, {
      passwordResetToken: hashedToken,
      passwordResetExpires: expires,
    });

    void emailService.sendPasswordResetEmail(user.email, plainToken).catch((error) => {
      logger.error('Password reset email delivery failed.', { code: error.code || 'SMTP_ERROR' });
    });
    logger.info(`Password reset requested for user [${user.id}]`);

    return { message: responseMsg };
  }

  /**
   * Resets password using token.
   * @param {string} plainToken
   * @param {string} newPassword
   * @returns {Promise<boolean>}
   */
  async resetPassword(plainToken, newPassword) {
    const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');
    const user = await userRepository.findByResetToken(hashedToken);
    const hashedPassword = await this.hashPassword(newPassword);
    const consumed = await userRepository.consumePasswordResetToken(
      hashedToken,
      hashedPassword,
      new Date().toISOString()
    );
    if (!consumed) throw ApiError.badRequest('Password reset token is invalid or has expired.');

    // Revoke all active sessions
    await tokenRepository.revokeAllUserTokens(user.id);
    logger.info('Password reset completed.');

    return true;
  }
}

module.exports = new AuthService();
