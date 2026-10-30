/**
 * @file account-lockout.unit.test.js
 * @description Unit tests for brute-force account lockout mechanism.
 */

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const userRepository = require('../../src/repositories/user.repository');
const { resetDatabase } = require('../../src/db/sqlite');

describe('Unit Tests: Account Lockout Mechanism', () => {
  let testUserId;

  before(async () => {
    resetDatabase();
    const hash = await bcrypt.hash('Test@SecurePassword123!', 10);
    const user = await userRepository.create({
      name: 'Lockout Target',
      email: 'lockout@example.com',
      password: hash,
      role: 'USER',
    });
    testUserId = user.id;
  });

  beforeEach(async () => {
    await userRepository.resetFailedLoginAttempts(testUserId);
  });

  it('should track failed login attempts sequentially', async () => {
    for (let i = 1; i <= 4; i++) {
      const status = await userRepository.incrementFailedLoginAttempts(testUserId);
      assert.strictEqual(status.attempts, i);
      assert.strictEqual(status.isLocked, false);
      assert.strictEqual(status.lockUntil, null);
    }
  });

  it('should lock the account on the 5th consecutive failed attempt', async () => {
    // 4 failed attempts
    for (let i = 1; i <= 4; i++) {
      await userRepository.incrementFailedLoginAttempts(testUserId);
    }

    // 5th failed attempt
    const status = await userRepository.incrementFailedLoginAttempts(testUserId);
    assert.strictEqual(status.attempts, 5);
    assert.strictEqual(status.isLocked, true);
    assert.ok(status.lockUntil, 'lockUntil timestamp should be populated');

    const lockDate = new Date(status.lockUntil);
    const now = new Date();
    assert.ok(lockDate > now, 'Lock expiration must be in the future');

    // Verify persisted state in database
    const user = await userRepository.findById(testUserId, { includePassword: true });
    assert.strictEqual(user.failedLoginAttempts, 5);
    assert.ok(user.lockUntil);
  });

  it('should reset failed login attempts upon successful authentication', async () => {
    await userRepository.incrementFailedLoginAttempts(testUserId);
    await userRepository.incrementFailedLoginAttempts(testUserId);

    let user = await userRepository.findById(testUserId, { includePassword: true });
    assert.strictEqual(user.failedLoginAttempts, 2);

    await userRepository.resetFailedLoginAttempts(testUserId);

    user = await userRepository.findById(testUserId, { includePassword: true });
    assert.strictEqual(user.failedLoginAttempts, 0);
    assert.strictEqual(user.lockUntil, null);
  });
});
