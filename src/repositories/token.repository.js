/**
 * @file token.repository.js
 * @description SQLite Data Access Object for Refresh Tokens with replay detection and token family tracking.
 */

const crypto = require('crypto');
const { getDatabase } = require('../db/sqlite');

class TokenRepository {
  constructor() {
    this._db = null;
  }

  /**
   * Returns active database instance.
   * @private
   * @returns {import('node:sqlite').DatabaseSync}
   */
  get db() {
    if (!this._db) {
      this._db = getDatabase();
    }
    return this._db;
  }

  /**
   * Sets custom database instance (e.g. for testing in-memory isolation).
   * @param {import('node:sqlite').DatabaseSync} customDb
   */
  setDatabase(customDb) {
    this._db = customDb;
  }

  /**
   * Hashes a raw refresh token using SHA-256 for secure storage and constant-time indexed lookup.
   * @param {string} rawToken
   * @returns {string} Hex-encoded SHA-256 hash
   */
  hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Inserts a new refresh token record.
   * @param {Object} tokenData
   * @returns {Promise<Object>}
   */
  async createToken({ tokenId, userId, familyId, rawToken, expiresAt }) {
    const tokenHash = this.hashToken(rawToken);
    const now = new Date().toISOString();
    const effectiveFamilyId = familyId || crypto.randomUUID();
    const expiresAtIso = expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt;

    const stmt = this.db.prepare(`
      INSERT INTO tokens (
        id, userId, familyId, tokenHash, expiresAt,
        isRevoked, replacedBy, revocationReason, revokedAt, createdAt
      ) VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, NULL, ?)
    `);

    stmt.run(tokenId, userId, effectiveFamilyId, tokenHash, expiresAtIso, now);

    return {
      id: tokenId,
      userId,
      familyId: effectiveFamilyId,
      tokenHash,
      expiresAt: expiresAtIso,
      isRevoked: false,
      createdAt: now,
    };
  }

  /**
   * Finds a token record by raw token string.
   * @param {string} rawToken
   * @returns {Promise<Object|null>}
   */
  async findByRawToken(rawToken) {
    const tokenHash = this.hashToken(rawToken);
    const stmt = this.db.prepare('SELECT * FROM tokens WHERE tokenHash = ?');
    const row = stmt.get(tokenHash);
    if (!row) return null;
    return {
      ...row,
      isRevoked: Boolean(row.isRevoked),
    };
  }

  /**
   * Marks a token as replaced by a new token during refresh rotation.
   * @param {string} tokenId
   * @param {string} newTokenId
   * @returns {Promise<boolean>}
   */
  async markAsReplaced(tokenId, newTokenId) {
    const isLogout = newTokenId === 'REVOKED_LOGOUT';
    const stmt = this.db.prepare(`
      UPDATE tokens
      SET isRevoked = 1, replacedBy = ?, revokedAt = ?, revocationReason = ?
      WHERE id = ? AND isRevoked = 0
    `);
    const info = stmt.run(newTokenId, new Date().toISOString(), isLogout ? 'USER_LOGOUT' : 'TOKEN_ROTATED', tokenId);
    return info.changes > 0;
  }

  /**
   * Revokes an entire token family when a reused or stolen token is detected.
   * @param {string} familyId
   * @returns {Promise<number>} Number of tokens revoked
   */
  async revokeFamily(familyId) {
    const stmt = this.db.prepare(`
      UPDATE tokens
      SET isRevoked = 1,
          revokedAt = ?,
          revocationReason = 'FAMILY_COMPROMISED_REPLAY_DETECTED'
      WHERE familyId = ? AND isRevoked = 0
    `);
    const info = stmt.run(new Date().toISOString(), familyId);
    return info.changes;
  }

  /**
   * Revokes all refresh tokens for a specific user (on password reset or global logout).
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async revokeAllUserTokens(userId) {
    const stmt = this.db.prepare(`
      UPDATE tokens
      SET isRevoked = 1,
          revokedAt = ?,
          revocationReason = 'USER_SESSION_TERMINATION'
      WHERE userId = ? AND isRevoked = 0
    `);
    const info = stmt.run(new Date().toISOString(), userId);
    return info.changes;
  }

  /**
   * Purges expired and revoked tokens.
   * @returns {Promise<number>}
   */
  async purgeExpiredTokens() {
    const now = new Date().toISOString();
    const stmt = this.db.prepare('DELETE FROM tokens WHERE expiresAt < ?');
    const info = stmt.run(now);
    return info.changes;
  }
}

module.exports = new TokenRepository();
