/**
 * @file user.repository.js
 * @description Data access layer for User entities with thread-safe atomic file persistence.
 * Follows the repository pattern so it can easily be swapped with MongoDB (Mongoose),
 * PostgreSQL (Prisma/TypeORM), or any SQL engine.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const envConfig = require('../config/env.config');
const logger = require('../utils/logger');

class UserRepository {
  constructor() {
    this.dataDir = path.resolve(process.cwd(), envConfig.DATA_DIR);
    this.filePath = path.join(this.dataDir, 'users.json');
    this._initializeStorage();
  }

  /**
   * Initializes data directory and empty users.json file if not present.
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
   * Reads all users from disk synchronously.
   * @private
   * @returns {Array<Object>}
   */
  _readAll() {
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(content || '[]');
    } catch (error) {
      logger.error('Failed to read users database file:', error);
      return [];
    }
  }

  /**
   * Writes all users atomically using a temporary file to avoid corruption on crash.
   * @private
   * @param {Array<Object>} data
   */
  _atomicWriteFileSync(data) {
    const tempPath = `${this.filePath}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, this.filePath);
  }

  /**
   * Strips sensitive properties such as password hash from user object.
   * @param {Object} user
   * @returns {Object}
   */
  sanitizeUser(user) {
    if (!user) return null;
    const { password, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Finds all users with filtering, searching, sorting, and pagination.
   * @param {Object} queryOptions
   * @param {number} [queryOptions.page=1]
   * @param {number} [queryOptions.limit=10]
   * @param {string} [queryOptions.search='']
   * @param {string} [queryOptions.role]
   * @param {string} [queryOptions.status]
   * @param {string} [queryOptions.sortBy='createdAt']
   * @param {'asc'|'desc'} [queryOptions.sortOrder='desc']
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
    let users = this._readAll();

    // Filter out soft-deleted users
    users = users.filter((u) => !u.isDeleted);

    // Filter by role
    if (role) {
      users = users.filter((u) => u.role === role);
    }

    // Filter by status (active, suspended, pending)
    if (status) {
      users = users.filter((u) => u.status === status);
    }

    // Search query on name, email
    if (search && search.trim() !== '') {
      const searchLower = search.trim().toLowerCase();
      users = users.filter(
        (u) =>
          u.name.toLowerCase().includes(searchLower) ||
          u.email.toLowerCase().includes(searchLower)
      );
    }

    // Sorting
    users.sort((a, b) => {
      let valA = a[sortBy] ?? '';
      let valB = b[sortBy] ?? '';

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const total = users.length;
    const startIndex = (page - 1) * limit;
    const paginated = users.slice(startIndex, startIndex + limit);

    return {
      users: paginated.map(this.sanitizeUser),
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Finds a user by ID.
   * @param {string} id
   * @param {Object} [options]
   * @param {boolean} [options.includePassword=false]
   * @returns {Promise<Object|null>}
   */
  async findById(id, { includePassword = false } = {}) {
    const users = this._readAll();
    const user = users.find((u) => u.id === id && !u.isDeleted);
    if (!user) return null;
    return includePassword ? { ...user } : this.sanitizeUser(user);
  }

  /**
   * Finds a user by email (case-insensitive).
   * @param {string} email
   * @param {Object} [options]
   * @param {boolean} [options.includePassword=false]
   * @returns {Promise<Object|null>}
   */
  async findByEmail(email, { includePassword = false } = {}) {
    if (!email) return null;
    const normalizedEmail = email.trim().toLowerCase();
    const users = this._readAll();
    const user = users.find(
      (u) => u.email.toLowerCase() === normalizedEmail && !u.isDeleted
    );
    if (!user) return null;
    return includePassword ? { ...user } : this.sanitizeUser(user);
  }

  /**
   * Creates a new user record.
   * @param {Object} userData
   * @returns {Promise<Object>}
   */
  async create(userData) {
    const users = this._readAll();
    const now = new Date().toISOString();

    const newUser = {
      id: crypto.randomUUID(),
      name: userData.name.trim(),
      email: userData.email.trim().toLowerCase(),
      password: userData.password, // Pre-hashed by service layer
      role: userData.role || 'USER',
      status: userData.status || 'ACTIVE',
      bio: userData.bio || '',
      isEmailVerified: userData.isEmailVerified || false,
      isDeleted: false,
      lastLoginAt: null,
      passwordChangedAt: null,
      passwordResetToken: null,
      passwordResetExpires: null,
      createdAt: now,
      updatedAt: now,
    };

    users.push(newUser);
    this._atomicWriteFileSync(users);
    return this.sanitizeUser(newUser);
  }

  /**
   * Updates an existing user by ID.
   * @param {string} id
   * @param {Object} updateData
   * @returns {Promise<Object|null>}
   */
  async update(id, updateData) {
    const users = this._readAll();
    const index = users.findIndex((u) => u.id === id && !u.isDeleted);
    if (index === -1) return null;

    const existingUser = users[index];
    const updatedUser = {
      ...existingUser,
      ...updateData,
      updatedAt: new Date().toISOString(),
    };

    // Keep primary key immutable
    updatedUser.id = existingUser.id;

    users[index] = updatedUser;
    this._atomicWriteFileSync(users);

    return this.sanitizeUser(updatedUser);
  }

  /**
   * Updates internal user authentication fields (e.g., password, reset tokens).
   * @param {string} id
   * @param {Object} authFields
   * @returns {Promise<Object|null>}
   */
  async updateAuthFields(id, authFields) {
    const users = this._readAll();
    const index = users.findIndex((u) => u.id === id && !u.isDeleted);
    if (index === -1) return null;

    const updatedUser = {
      ...users[index],
      ...authFields,
      updatedAt: new Date().toISOString(),
    };

    users[index] = updatedUser;
    this._atomicWriteFileSync(users);

    return updatedUser;
  }

  /**
   * Deletes a user (soft delete by default, or hard removal).
   * @param {string} id
   * @param {boolean} [hardDelete=false]
   * @returns {Promise<boolean>}
   */
  async delete(id, hardDelete = false) {
    const users = this._readAll();
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) return false;

    if (hardDelete) {
      users.splice(index, 1);
    } else {
      users[index].isDeleted = true;
      users[index].deletedAt = new Date().toISOString();
      users[index].updatedAt = new Date().toISOString();
    }

    this._atomicWriteFileSync(users);
    return true;
  }

  /**
   * Aggregates statistics for the administrative dashboard.
   * @returns {Promise<Object>}
   */
  async getStatistics() {
    const users = this._readAll().filter((u) => !u.isDeleted);
    const stats = {
      totalUsers: users.length,
      byRole: {
        ADMIN: 0,
        MODERATOR: 0,
        USER: 0,
      },
      byStatus: {
        ACTIVE: 0,
        SUSPENDED: 0,
        PENDING: 0,
      },
      verifiedEmails: 0,
    };

    for (const u of users) {
      if (stats.byRole[u.role] !== undefined) {
        stats.byRole[u.role]++;
      }
      if (stats.byStatus[u.status] !== undefined) {
        stats.byStatus[u.status]++;
      }
      if (u.isEmailVerified) {
        stats.verifiedEmails++;
      }
    }

    return stats;
  }
}

module.exports = new UserRepository();
