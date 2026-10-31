/**
 * @file token.service.js
 * @description Handles cryptographic JWT signing, verification, and refresh token lifecycle.
 * Implements token rotation and replay detection per OWASP guidelines.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const envConfig = require('../config/env.config');
const tokenRepository = require('../repositories/token.repository');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

class TokenService {
  generateStepUpToken(user, purpose) {
    return jwt.sign(
      {
        sub: user.id,
        type: 'step_up',
        purpose,
        pwdv: user.passwordChangedAt ?? null,
      },
      envConfig.JWT_ACCESS_SECRET,
      {
        expiresIn: '5m',
        issuer: 'secure-user-management-api',
      }
    );
  }

  verifyStepUpToken(token) {
    try {
      const decoded = jwt.verify(token, envConfig.JWT_ACCESS_SECRET, {
        issuer: 'secure-user-management-api',
      });
      if (decoded.type !== 'step_up') {
        throw ApiError.unauthorized('Invalid verification token type.');
      }
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized('Identity verification has expired. Verify your identity again.');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw ApiError.unauthorized('Invalid identity verification token.');
      }
      throw error;
    }
  }

  /**
   * Generates a short-lived temporary token for completing the 2nd step of MFA login.
   * @param {Object} user
   * @returns {string} Signed JWT MFA challenge token
   */
  generateMfaToken(user, passwordChangedAt = user.passwordChangedAt ?? null) {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        type: 'mfa_pending',
        pwdv: passwordChangedAt,
      },
      envConfig.JWT_ACCESS_SECRET,
      {
        expiresIn: '5m',
        issuer: 'secure-user-management-api',
      }
    );
  }

  /**
   * Verifies an MFA challenge token.
   * @param {string} token
   * @returns {Object} Decoded payload
   */
  verifyMfaToken(token) {
    try {
      const decoded = jwt.verify(token, envConfig.JWT_ACCESS_SECRET, {
        issuer: 'secure-user-management-api',
      });
      if (decoded.type !== 'mfa_pending') {
        throw ApiError.unauthorized('Invalid MFA token type.');
      }
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized('MFA verification session has expired. Please login again.');
      }
      throw ApiError.unauthorized('Invalid MFA verification token.');
    }
  }

  /**
   * Generates a short-lived access token.
   * @param {Object} payload - User identification and role claims.
   * @param {string} payload.id - User ID
   * @param {string} payload.email - User email
   * @param {string} payload.role - User RBAC role
   * @returns {string} Signed JWT access token
   */
  generateAccessToken(payload, passwordChangedAt = payload.passwordChangedAt ?? null) {
    return jwt.sign(
      {
        sub: payload.id,
        email: payload.email,
        role: payload.role,
        type: 'access',
        pwdv: passwordChangedAt,
      },
      envConfig.JWT_ACCESS_SECRET,
      {
        expiresIn: envConfig.JWT_ACCESS_EXPIRES_IN,
        issuer: 'secure-user-management-api',
      }
    );
  }

  /**
   * Parses expiration duration string (e.g., '7d', '15m') into a future Date.
   * @param {string} durationStr
   * @returns {Date}
   */
  getExpirationDate(durationStr) {
    const match = durationStr.match(/^(\d+)([smhd])$/);
    const now = new Date();
    if (!match) {
      // Default to 7 days
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    const val = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's':
        return new Date(now.getTime() + val * 1000);
      case 'm':
        return new Date(now.getTime() + val * 60 * 1000);
      case 'h':
        return new Date(now.getTime() + val * 60 * 60 * 1000);
      case 'd':
      default:
        return new Date(now.getTime() + val * 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Generates a long-lived refresh token and persists its hashed fingerprint.
   * @param {Object} user - User entity
   * @param {string} [existingFamilyId] - Retain family ID during rotation
   * @returns {Promise<{ refreshToken: string, tokenId: string, familyId: string, expiresAt: Date }>}
   */
  async generateRefreshToken(user, existingFamilyId = null) {
    const tokenId = crypto.randomUUID();
    const familyId = existingFamilyId || crypto.randomUUID();
    const expiresAt = this.getExpirationDate(envConfig.JWT_REFRESH_EXPIRES_IN);

    const refreshToken = jwt.sign(
      {
        sub: user.id,
        jti: tokenId,
        familyId,
        type: 'refresh',
      },
      envConfig.JWT_REFRESH_SECRET,
      {
        expiresIn: envConfig.JWT_REFRESH_EXPIRES_IN,
        issuer: 'secure-user-management-api',
      }
    );

    await tokenRepository.createToken({
      tokenId,
      userId: user.id,
      familyId,
      rawToken: refreshToken,
      expiresAt,
    });

    return {
      refreshToken,
      tokenId,
      familyId,
      expiresAt,
    };
  }

  /**
   * Verifies an access token and returns its decoded payload.
   * @param {string} token
   * @returns {Object} Decoded token payload
   */
  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, envConfig.JWT_ACCESS_SECRET, {
        issuer: 'secure-user-management-api',
      });
      if (decoded.type !== 'access') {
        throw ApiError.unauthorized('Invalid token purpose');
      }
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized('Access token has expired. Please refresh your session.');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw ApiError.unauthorized('Invalid access token.');
      }
      throw error;
    }
  }

  /**
   * Verifies a refresh token and validates against database records for rotation.
   * Implements reuse detection: if a revoked token is used, all tokens in its family are revoked.
   * @param {string} rawToken
   * @returns {Promise<{ decoded: Object, tokenRecord: Object }>}
   */
  async verifyRefreshToken(rawToken) {
    let decoded;
    try {
      decoded = jwt.verify(rawToken, envConfig.JWT_REFRESH_SECRET, {
        issuer: 'secure-user-management-api',
      });
      if (decoded.type !== 'refresh') {
        throw ApiError.unauthorized('Invalid token purpose');
      }
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized('Refresh token has expired. Please login again.');
      }
      throw ApiError.unauthorized('Invalid or forged refresh token.');
    }

    const tokenRecord = await tokenRepository.findByRawToken(rawToken);

    // If token not found or already revoked -> potential token theft replay attack!
    if (!tokenRecord || tokenRecord.isRevoked) {
      if (decoded.familyId) {
        logger.warn(
          `Security Alert: Refresh token reuse detected! Revoking family ${decoded.familyId} for user ${decoded.sub}`
        );
        await tokenRepository.revokeFamily(decoded.familyId);
      }
      throw ApiError.unauthorized('Session compromised or already invalidated. Please log in again.');
    }

    // Check expiration date in DB
    if (new Date(tokenRecord.expiresAt) <= new Date()) {
      throw ApiError.unauthorized('Refresh token expired. Please login again.');
    }

    return { decoded, tokenRecord };
  }

  /**
   * Rotates a refresh token: revokes old token and issues a new pair.
   * @param {string} oldRefreshToken
   * @param {Object} user
   * @returns {Promise<{ accessToken: string, refreshToken: string }>}
   */
  async rotateRefreshToken(oldRefreshToken, user, passwordChangedAt = user.passwordChangedAt ?? null) {
    const { decoded, tokenRecord } = await this.verifyRefreshToken(oldRefreshToken);

    // Issue new access and refresh tokens maintaining the same familyId
    const newAccessToken = this.generateAccessToken(user, passwordChangedAt);
    const { refreshToken: newRefreshToken, tokenId: newTokenId } =
      await this.generateRefreshToken(user, decoded.familyId);

    // Mark previous token as replaced
    const replaced = await tokenRepository.markAsReplaced(tokenRecord.id, newTokenId);
    if (!replaced) {
      await tokenRepository.revokeFamily(decoded.familyId);
      throw ApiError.unauthorized('Session compromised or already invalidated. Please log in again.');
    }

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Generates a secure random token for password resets.
   * @returns {{ plainToken: string, hashedToken: string, expires: string }}
   */
  generatePasswordResetToken() {
    const plainToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');
    // Token valid for 1 hour
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    return {
      plainToken,
      hashedToken,
      expires,
    };
  }
}

module.exports = new TokenService();
