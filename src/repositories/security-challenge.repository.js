const { getDatabase } = require('../db/sqlite');

class SecurityChallengeRepository {
  get db() {
    return getDatabase();
  }

  hasRecentChallenge(userId, purpose, since) {
    return Boolean(this.db.prepare(`
      SELECT 1
      FROM security_otp_challenges
      WHERE userId = ? AND purpose = ? AND createdAt > ?
      LIMIT 1
    `).get(userId, purpose, since));
  }

  create({ id, userId, purpose, codeHash, expiresAt }) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE security_otp_challenges
      SET consumedAt = ?
      WHERE userId = ? AND purpose = ? AND consumedAt IS NULL
    `).run(now, userId, purpose);
    this.db.prepare(`
      DELETE FROM security_otp_challenges
      WHERE expiresAt < ? AND consumedAt IS NOT NULL
    `).run(now);
    this.db.prepare(`
      INSERT INTO security_otp_challenges
        (id, userId, purpose, codeHash, expiresAt, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, purpose, codeHash, expiresAt, now);
  }

  findActive(id, userId, purpose) {
    return this.db.prepare(`
      SELECT id, codeHash, expiresAt, attempts
      FROM security_otp_challenges
      WHERE id = ? AND userId = ? AND purpose = ?
        AND consumedAt IS NULL AND expiresAt > ? AND attempts < 5
    `).get(id, userId, purpose, new Date().toISOString());
  }

  recordFailedAttempt(id, userId, purpose) {
    return this.db.prepare(`
      UPDATE security_otp_challenges
      SET attempts = attempts + 1,
          consumedAt = CASE WHEN attempts + 1 >= 5 THEN ? ELSE consumedAt END
      WHERE id = ? AND userId = ? AND purpose = ?
        AND consumedAt IS NULL AND expiresAt > ? AND attempts < 5
    `).run(new Date().toISOString(), id, userId, purpose, new Date().toISOString()).changes === 1;
  }

  consume(id, userId, purpose, codeHash) {
    return this.db.prepare(`
      UPDATE security_otp_challenges
      SET consumedAt = ?
      WHERE id = ? AND userId = ? AND purpose = ? AND codeHash = ?
        AND consumedAt IS NULL AND expiresAt > ? AND attempts < 5
    `).run(new Date().toISOString(), id, userId, purpose, codeHash, new Date().toISOString()).changes === 1;
  }

  invalidate(id, userId) {
    return this.db.prepare(`
      UPDATE security_otp_challenges
      SET consumedAt = ?
      WHERE id = ? AND userId = ? AND consumedAt IS NULL
    `).run(new Date().toISOString(), id, userId).changes === 1;
  }
}

module.exports = new SecurityChallengeRepository();
