/**
 * @file sqlite.js
 * @description SQLite database connection and initialization using Node.js built-in
 * node:sqlite (DatabaseSync). Thread-safe, embedded, zero-dependency relational database.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const envConfig = require('../config/env.config');
const logger = require('../utils/logger');

let dbInstance = null;

/**
 * Initializes and returns the active SQLite database instance.
 * @param {string} [customPath] - Optional path or ':memory:' for tests
 * @returns {DatabaseSync}
 */
function getDatabase(customPath = null) {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  let dbPath;
  if (customPath) {
    dbPath = customPath;
  } else if (process.env.NODE_ENV === 'test' && process.env.SQLITE_TEST_FILE !== 'true') {
    dbPath = ':memory:';
  } else {
    const dataDir = path.resolve(process.cwd(), envConfig.DATA_DIR || './data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    dbPath = path.join(dataDir, 'app.db');
  }

  const db = new DatabaseSync(dbPath);

  // Performance & Integrity Pragmas
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  // Initialize Tables
  initializeSchema(db);

  if (!customPath) {
    dbInstance = db;
  }

  logger.info(`💾 SQLite Database connected successfully (${dbPath})`);
  return db;
}

/**
 * Creates database tables and indexes if they do not exist.
 * @param {DatabaseSync} db
 */
function initializeSchema(db) {
  // Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      bio TEXT DEFAULT '',
      isEmailVerified INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0,
      failedLoginAttempts INTEGER DEFAULT 0,
      lockUntil TEXT DEFAULT NULL,
      mfaEnabled INTEGER DEFAULT 0,
      mfaSecret TEXT DEFAULT NULL,
      lastLoginAt TEXT DEFAULT NULL,
      passwordChangedAt TEXT DEFAULT NULL,
      passwordResetToken TEXT DEFAULT NULL,
      passwordResetExpires TEXT DEFAULT NULL,
      deletedAt TEXT DEFAULT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(passwordResetToken);
  `);

  // Tokens Table (Refresh tokens and rotation families)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      familyId TEXT NOT NULL,
      tokenHash TEXT UNIQUE NOT NULL,
      expiresAt TEXT NOT NULL,
      isRevoked INTEGER DEFAULT 0,
      replacedBy TEXT DEFAULT NULL,
      revocationReason TEXT DEFAULT NULL,
      revokedAt TEXT DEFAULT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tokens_tokenHash ON tokens(tokenHash);
    CREATE INDEX IF NOT EXISTS idx_tokens_familyId ON tokens(familyId);
    CREATE INDEX IF NOT EXISTS idx_tokens_userId ON tokens(userId);
  `);
}

/**
 * Closes the database connection.
 */
function closeDatabase() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (e) {
      // Ignored if already closed
    }
    dbInstance = null;
  }
}

/**
 * Resets database (clears all records) - primarily used in automated test setups.
 * @param {DatabaseSync} [db]
 */
function resetDatabase(db = null) {
  const targetDb = db || dbInstance || getDatabase();
  targetDb.exec(`
    DELETE FROM tokens;
    DELETE FROM users;
  `);
}

module.exports = {
  getDatabase,
  closeDatabase,
  resetDatabase,
  initializeSchema,
};
