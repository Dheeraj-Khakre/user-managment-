/**
 * @file token.service.unit.test.js
 * @description Unit tests for JWT signing, verification, session timeout,
 * and refresh token rotation with replay detection.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const tokenService = require('../../src/services/token.service');
const userRepository = require('../../src/repositories/user.repository');
const { getDatabase, resetDatabase } = require('../../src/db/sqlite');
const envConfig = require('../../src/config/env.config');

describe('Unit Tests: Token Service & Session Security', () => {
  before(async () => {
    // Initialize database for testing and insert mock user to satisfy foreign key constraint
    resetDatabase();
    await userRepository.create({
      name: 'Mock User',
      email: mockUser.email,
      password: 'HashedPassword123!',
      role: mockUser.role,
    });
    const createdUser = await userRepository.findByEmail(mockUser.email);
    mockUser.id = createdUser.id;
  });

  const mockUser = {
    id: 'test-user-uuid-1234',
    email: 'tester@example.com',
    role: 'USER',
  };

  it('should generate and verify a valid access token', () => {
    const token = tokenService.generateAccessToken(mockUser);
    assert.ok(token, 'Access token string should be created');

    const decoded = tokenService.verifyAccessToken(token);
    assert.strictEqual(decoded.sub, mockUser.id);
    assert.strictEqual(decoded.email, mockUser.email);
    assert.strictEqual(decoded.role, mockUser.role);
    assert.strictEqual(decoded.type, 'access');
  });

  it('Session Timeout: should reject expired access tokens', () => {
    // Generate an already expired token (expired 5 seconds ago)
    const expiredToken = jwt.sign(
      {
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        type: 'access',
      },
      envConfig.JWT_ACCESS_SECRET,
      {
        expiresIn: '-5s',
        issuer: 'secure-user-management-api',
      }
    );

    assert.throws(
      () => {
        tokenService.verifyAccessToken(expiredToken);
      },
      (err) => {
        return err.statusCode === 401 && err.message.includes('expired');
      },
      'Should throw 401 on expired session token'
    );
  });

  it('should generate, verify, and rotate refresh tokens', async () => {
    const { refreshToken, familyId } = await tokenService.generateRefreshToken(mockUser);
    assert.ok(refreshToken);
    assert.ok(familyId);

    // Verify refresh token
    const { decoded, tokenRecord } = await tokenService.verifyRefreshToken(refreshToken);
    assert.strictEqual(decoded.sub, mockUser.id);
    assert.strictEqual(tokenRecord.isRevoked, false);

    // Rotate refresh token
    const rotated = await tokenService.rotateRefreshToken(refreshToken, mockUser);
    assert.ok(rotated.accessToken, 'New access token issued');
    assert.ok(rotated.refreshToken, 'New refresh token issued');
    assert.notStrictEqual(rotated.refreshToken, refreshToken, 'Rotated token should be different');

    // Attempting to reuse old refresh token should fail with replay alert
    await assert.rejects(
      async () => {
        await tokenService.verifyRefreshToken(refreshToken);
      },
      (err) => {
        return err.statusCode === 401 && err.message.includes('compromised');
      },
      'Re-using previous refresh token must be rejected'
    );
  });

  it('allows only one concurrent refresh-token rotation', async () => {
    const { refreshToken } = await tokenService.generateRefreshToken(mockUser);
    const results = await Promise.allSettled([
      tokenService.rotateRefreshToken(refreshToken, mockUser),
      tokenService.rotateRefreshToken(refreshToken, mockUser),
    ]);

    assert.strictEqual(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.strictEqual(results.filter((result) => result.status === 'rejected').length, 1);
  });

  it('should issue and verify temporary MFA challenge tokens', () => {
    const mfaToken = tokenService.generateMfaToken(mockUser);
    assert.ok(mfaToken);

    const decoded = tokenService.verifyMfaToken(mfaToken);
    assert.strictEqual(decoded.sub, mockUser.id);
    assert.strictEqual(decoded.type, 'mfa_pending');
  });
});
