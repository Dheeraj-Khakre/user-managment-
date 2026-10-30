/**
 * @file token.repository.js
 * @description Data access layer for Refresh Tokens supporting rotation and replay detection.
 * Refresh tokens are hashed using SHA-256 before persistence to prevent credential leaks.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const envConfig = require('../config/env.config');
const logger = require('../utils/logger');

class TokenRepository {
  constructor() {
    this.dataDir = path.resolve(process.cwd(), envConfig.DATA_DIR);
    this.filePath = path.join(this.dataDir, 'tokens.json');
    this._initializeStorage();
  }

  /**
   * Initializes tokens file if absent.
   * @private
   */
  _initializeStorage() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      this._atomicWriteFileSync([]);
    }
  }

  /**
   * Reads all token records synchronously.
   * @private
   * @returns {Array<Object>}
   */
  _readAll() {
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(content || '[]');
    } catch (error) {
      logger.error('Failed to read tokens database file:', error);
      return [];
    }
  }

  /**
   * Writes all tokens atomically using a temporary file.
   * @private
   * @param {Array<Object>} data
   */
  _atomicWriteFileSync(data) {
    const tempPath = `${this.filePath}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, this.filePath);
  }

  /**
   * Hash a raw token with SHA-256 for secure lookup and storage.
   * @param {string} rawToken
   * @returns {string}
   */
  hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Saves a newly issued refresh token.
   * @param {Object} tokenData
   * @param {string} tokenData.tokenId - Unique JWT identifier (jti)
   * @param {string} tokenData.userId - User primary key
   * @param {string} tokenData.familyId - Token family for rotation replay detection
   * @param {string} tokenData.rawToken - Raw refresh token string (will be hashed)
   * @param {Date} tokenData.expiresAt - Token expiry date
   * @returns {Promise<Object>}
   */
  async createToken({ tokenId, userId, familyId, rawToken, expiresAt }) {
    const tokens = this._readAll();
    const tokenRecord = {
      id: tokenId,
      userId,
      familyId: familyId || crypto.randomUUID(),
      tokenHash: this.hashToken(rawToken),
      expiresAt: expiresAt.toISOString(),
      isRevoked: false,
      replacedBy: null,
      createdAt: new Date().toISOString(),
    };

    tokens.push(tokenRecord);
    this._atomicWriteFileSync(tokens);
    return tokenRecord;
  }

  /**
   * Finds a token record by raw token string.
   * @param {string} rawToken
   * @returns {Promise<Object|null>}
   */
  async findByRawToken(rawToken) {
    const tokenHash = this.hashToken(rawToken);
    const tokens = this._readAll();
    return tokens.find((t) => t.tokenHash === tokenHash) || null;
  }

  /**
   * Marks a token as replaced by a new token during refresh rotation.
   * @param {string} tokenId
   * @param {string} newTokenId
   * @returns {Promise<boolean>}
   */
  async markAsReplaced(tokenId, newTokenId) {
    const tokens = this._readAll();
    const token = tokens.find((t) => t.id === tokenId);
    if (!token) return false;

    token.isRevoked = true;
    token.replacedBy = newTokenId;
    token.revokedAt = new Date().toISOString();

    this._atomicWriteFileSync(tokens);
    return true;
  }

  /**
   * Revokes an entire token family when a reused/stolen token is detected.
   * @param {string} familyId
   * @returns {Promise<number>} Number of tokens revoked
   */
  async revokeFamily(familyId) {
    const tokens = this._readAll();
    let count = 0;
    const now = new Date().toISOString();

    for (const t of tokens) {
      if (t.familyId === familyId && !t.isRevoked) {
        t.isRevoked = true;
        t.revokedAt = now;
        t.revocationReason = 'FAMILY_COMPROMISED_REPLAY_DETECTED';
        count++;
      }
    }

    if (count > 0) {
      this._atomicWriteFileSync(tokens);
    }
    return count;
  }

  /**
   * Revokes all refresh tokens for a specific user (e.g., on password reset or global logout).
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async revokeAllUserTokens(userId) {
    const tokens = this._readAll();
    let count = 0;
    const now = new Date().toISOString();

    for (const t of tokens) {
      if (t.userId === userId && !t.isRevoked) {
        t.isRevoked = true;
        t.revokedAt = now;
        t.revocationReason = 'USER_SESSION_TERMINATION';
        count++;
      }
    }

    if (count > 0) {
      this._atomicWriteFileSync(tokens);
    }
    return count;
  }

  /**
   * Purges expired and revoked tokens older than 30 days to prevent unbounded growth.
   * @returns {Promise<number>}
   */
  async purgeExpiredTokens() {
    const tokens = this._readAll();
    const now = new Date();
    const validTokens = tokens.filter((t) => new Date(t.expiresAt) > now);
    const purged = tokens.length - validTokens.length;

    if (purged > 0) {
      this._atomicWriteFileSync(validTokens);
    }
    return purged;
  }
}

module.exports = new TokenRepository();
