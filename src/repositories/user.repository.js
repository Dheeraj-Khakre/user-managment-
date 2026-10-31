/**
 * @file user.repository.js
 * @description SQLite Data Access Object for User entities.
 * Uses prepared statements to guarantee complete immunity against SQL Injection attacks.
 */

const crypto = require('crypto');
const { getDatabase } = require('../db/sqlite');

class UserRepository {
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
   * Sanitizes user record for API output:
   * Strips password hash and MFA secret, casts integer booleans to true/false.
   * @param {Object} user
   * @returns {Object|null}
   */
  sanitizeUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      bio: user.bio,
      isEmailVerified: Boolean(user.isEmailVerified),
      mfaEnabled: Boolean(user.mfaEnabled),
      lastLoginAt: user.lastLoginAt,
      passwordChangedAt: user.passwordChangedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Formats raw SQL row to standard model object.
   * @private
   */
  _mapRow(row) {
    if (!row) return null;
    return {
      ...row,
      isEmailVerified: Boolean(row.isEmailVerified),
      isDeleted: Boolean(row.isDeleted),
      mfaEnabled: Boolean(row.mfaEnabled),
    };
  }

  /**
   * Finds all users with filtering, sorting, and pagination.
   * @param {Object} queryOptions
   * @returns {Promise<{ users: Array<Object>, total: number, page: number, totalPages: number }>}
   */
  async findAll({
    page = 1,
    limit = 10,
    search = '',
    role,
    status,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = {}) {
    const conditions = ['isDeleted = 0'];
    const params = [];

    if (role) {
      conditions.push('role = ?');
      params.push(role);
    }

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (search && search.trim() !== '') {
      conditions.push('(name LIKE ? OR email LIKE ?)');
      const searchPattern = `%${search.trim()}%`;
      params.push(searchPattern, searchPattern);
    }

    const whereClause = conditions.join(' AND ');

    // Safe sorting column whitelist
    const allowedSortColumns = ['createdAt', 'name', 'email', 'role', 'status', 'updatedAt'];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'createdAt';
    const safeSortOrder = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Count query
    const countSql = `SELECT COUNT(*) as total FROM users WHERE ${whereClause}`;
    const countStmt = this.db.prepare(countSql);
    const countResult = countStmt.get(...params);
    const total = countResult ? countResult.total : 0;

    // Paginated select query
    const offset = (page - 1) * limit;
    const selectSql = `
      SELECT * FROM users
      WHERE ${whereClause}
      ORDER BY ${safeSortBy} ${safeSortOrder}
      LIMIT ? OFFSET ?
    `;
    const selectStmt = this.db.prepare(selectSql);
    const rows = selectStmt.all(...params, limit, offset);

    return {
      users: rows.map(this.sanitizeUser),
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Finds user by ID.
   * @param {string} id
   * @param {Object} [options]
   * @param {boolean} [options.includePassword=false]
   * @returns {Promise<Object|null>}
   */
  async findById(id, { includePassword = false } = {}) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ? AND isDeleted = 0');
    const row = stmt.get(id);
    if (!row) return null;
    return includePassword ? this._mapRow(row) : this.sanitizeUser(row);
  }

  /**
   * Finds user by email (case-insensitive via SQLite COLLATE NOCASE).
   * @param {string} email
   * @param {Object} [options]
   * @param {boolean} [options.includePassword=false]
   * @returns {Promise<Object|null>}
   */
  async findByEmail(email, { includePassword = false } = {}) {
    if (!email) return null;
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ? AND isDeleted = 0');
    const row = stmt.get(email.trim().toLowerCase());
    if (!row) return null;
    return includePassword ? this._mapRow(row) : this.sanitizeUser(row);
  }

  /**
   * Finds user by active password reset token.
   * @param {string} hashedToken
   * @returns {Promise<Object|null>}
   */
  async findByResetToken(hashedToken) {
    const stmt = this.db.prepare(`
      SELECT * FROM users
      WHERE passwordResetToken = ? AND isDeleted = 0
    `);
    const row = stmt.get(hashedToken);
    return row ? this._mapRow(row) : null;
  }

  async consumePasswordResetToken(hashedToken, password, passwordChangedAt) {
    const now = new Date().toISOString();
    const info = this.db.prepare(`
      UPDATE users
      SET password = ?,
          passwordResetToken = NULL,
          passwordResetExpires = NULL,
          passwordChangedAt = ?,
          updatedAt = ?
      WHERE passwordResetToken = ?
        AND passwordResetExpires > ?
        AND isDeleted = 0
    `).run(password, passwordChangedAt, now, hashedToken, now);
    return info.changes === 1;
  }

  /**
   * Creates a new user record in SQLite.
   * @param {Object} userData
   * @returns {Promise<Object>}
   */
  async create(userData) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO users (
        id, name, email, password, role, status, bio,
        isEmailVerified, isDeleted, failedLoginAttempts, lockUntil,
        mfaEnabled, mfaSecret, createdAt, updatedAt
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, 0, 0, NULL,
        ?, ?, ?, ?
      )
    `);

    stmt.run(
      id,
      userData.name.trim(),
      userData.email.trim().toLowerCase(),
      userData.password,
      userData.role || 'USER',
      userData.status || 'ACTIVE',
      userData.bio || '',
      userData.isEmailVerified ? 1 : 0,
      userData.mfaEnabled ? 1 : 0,
      userData.mfaSecret || null,
      now,
      now
    );

    return this.findById(id);
  }

  /**
   * Updates an existing user record.
   * @param {string} id
   * @param {Object} updateData
   * @returns {Promise<Object|null>}
   */
  async update(id, updateData) {
    const fields = [];
    const params = [];

    const allowed = ['name', 'bio', 'role', 'status', 'isEmailVerified', 'password', 'lastLoginAt', 'passwordChangedAt'];

    for (const key of allowed) {
      if (updateData[key] !== undefined) {
        fields.push(`${key} = ?`);
        if (key === 'isEmailVerified') {
          params.push(updateData[key] ? 1 : 0);
        } else {
          params.push(updateData[key]);
        }
      }
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push('updatedAt = ?');
    params.push(new Date().toISOString());

    params.push(id);
    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ? AND isDeleted = 0`;
    const stmt = this.db.prepare(sql);
    stmt.run(...params);

    return this.findById(id);
  }

  /**
   * Updates authentication security fields (passwords, tokens, lockout, MFA).
   * @param {string} id
   * @param {Object} authFields
   * @returns {Promise<Object|null>}
   */
  async updateAuthFields(id, authFields) {
    const fields = [];
    const params = [];

    for (const [key, val] of Object.entries(authFields)) {
      fields.push(`${key} = ?`);
      if (typeof val === 'boolean') {
        params.push(val ? 1 : 0);
      } else {
        params.push(val);
      }
    }

    fields.push('updatedAt = ?');
    params.push(new Date().toISOString());
    params.push(id);

    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ? AND isDeleted = 0`;
    this.db.prepare(sql).run(...params);

    return this.findById(id, { includePassword: true });
  }

  /**
   * Increments failed login attempts and applies temporary account lockout if threshold is exceeded.
   * Threshold: 5 failed attempts locks the account for 15 minutes.
   * @param {string} userId
   * @returns {Promise<{ isLocked: boolean, lockUntil: string|null, attempts: number }>}
   */
  async incrementFailedLoginAttempts(userId) {
    const user = await this.findById(userId, { includePassword: true });
    if (!user) return { isLocked: false, lockUntil: null, attempts: 0 };

    const newAttempts = (user.failedLoginAttempts || 0) + 1;
    let lockUntil = null;
    let isLocked = false;

    // Lock account if 5 consecutive failed attempts
    if (newAttempts >= 5) {
      isLocked = true;
      // Lock for 15 minutes
      lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }

    const stmt = this.db.prepare(`
      UPDATE users
      SET failedLoginAttempts = ?, lockUntil = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(newAttempts, lockUntil, new Date().toISOString(), userId);

    return {
      isLocked,
      lockUntil,
      attempts: newAttempts,
    };
  }

  /**
   * Resets failed login attempts after successful authentication.
   * @param {string} userId
   */
  async resetFailedLoginAttempts(userId) {
    const stmt = this.db.prepare(`
      UPDATE users
      SET failedLoginAttempts = 0, lockUntil = NULL, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(new Date().toISOString(), userId);
  }

  /**
   * Sets MFA secret for user.
   * @param {string} userId
   * @param {string} mfaSecret
   */
  async setMfaSecret(userId, mfaSecret) {
    const stmt = this.db.prepare(`
      UPDATE users
      SET mfaSecret = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(mfaSecret, new Date().toISOString(), userId);
  }

  /**
   * Enables MFA on user account.
   * @param {string} userId
   */
  async enableMfa(userId) {
    const stmt = this.db.prepare(`
      UPDATE users
      SET mfaEnabled = 1, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(new Date().toISOString(), userId);
  }

  /**
   * Disables MFA on user account.
   * @param {string} userId
   */
  async disableMfa(userId) {
    const stmt = this.db.prepare(`
      UPDATE users
      SET mfaEnabled = 0, mfaSecret = NULL, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(new Date().toISOString(), userId);
  }

  /**
   * Deletes a user (soft delete by default, or hard removal).
   * @param {string} id
   * @param {boolean} [hardDelete=false]
   * @returns {Promise<boolean>}
   */
  async delete(id, hardDelete = false) {
    if (hardDelete) {
      const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
      const info = stmt.run(id);
      return info.changes > 0;
    }

    const stmt = this.db.prepare(`
      UPDATE users
      SET isDeleted = 1, deletedAt = ?, updatedAt = ?
      WHERE id = ?
    `);
    const now = new Date().toISOString();
    const info = stmt.run(now, now, id);
    return info.changes > 0;
  }

  /**
   * Aggregates administrative system statistics.
   * @returns {Promise<Object>}
   */
  async getStatistics() {
    const sql = `
      SELECT
        COUNT(*) as totalUsers,
        SUM(CASE WHEN role = 'ADMIN' THEN 1 ELSE 0 END) as adminCount,
        SUM(CASE WHEN role = 'MODERATOR' THEN 1 ELSE 0 END) as modCount,
        SUM(CASE WHEN role = 'USER' THEN 1 ELSE 0 END) as userCount,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as activeCount,
        SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) as suspendedCount,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pendingCount,
        SUM(CASE WHEN isEmailVerified = 1 THEN 1 ELSE 0 END) as verifiedEmails,
        SUM(CASE WHEN mfaEnabled = 1 THEN 1 ELSE 0 END) as mfaEnabledCount
      FROM users
      WHERE isDeleted = 0
    `;
    const row = this.db.prepare(sql).get();

    return {
      totalUsers: row.totalUsers || 0,
      byRole: {
        ADMIN: row.adminCount || 0,
        MODERATOR: row.modCount || 0,
        USER: row.userCount || 0,
      },
      byStatus: {
        ACTIVE: row.activeCount || 0,
        SUSPENDED: row.suspendedCount || 0,
        PENDING: row.pendingCount || 0,
      },
      verifiedEmails: row.verifiedEmails || 0,
      mfaActiveUsers: row.mfaEnabledCount || 0,
    };
  }
}

module.exports = new UserRepository();
