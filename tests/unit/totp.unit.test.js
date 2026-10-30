/**
 * @file totp.unit.test.js
 * @description Unit tests for RFC 6238 TOTP (Time-Based One-Time Password) utility.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const totpUtil = require('../../src/utils/totp');

describe('Unit Tests: TOTP (Multi-Factor Authentication)', () => {
  it('should generate a valid 32-character base32 secret', () => {
    const secret = totpUtil.generateSecret(20);
    assert.ok(secret, 'Secret should be generated');
    assert.strictEqual(secret.length, 32, 'Default 20-byte secret should produce 32 base32 characters');
    assert.match(secret, /^[A-Z2-7]+$/, 'Secret should contain valid RFC 4648 Base32 characters');
  });

  it('should generate a 6-digit numeric OTP code', () => {
    const secret = totpUtil.generateSecret();
    const code = totpUtil.generateCode(secret);
    assert.strictEqual(code.length, 6, 'OTP code must be 6 digits');
    assert.match(code, /^\d{6}$/, 'OTP code must be numeric digits only');
  });

  it('should verify a valid current OTP code', () => {
    const secret = totpUtil.generateSecret();
    const code = totpUtil.generateCode(secret);
    const isValid = totpUtil.verifyCode(secret, code);
    assert.strictEqual(isValid, true, 'Current code should be valid');
  });

  it('should tolerate +/- 1 time step (30s) drift window', () => {
    const secret = totpUtil.generateSecret();
    // Simulate code generated 25 seconds ago
    const pastTimestamp = Date.now() - 25 * 1000;
    const pastCode = totpUtil.generateCode(secret, 30, pastTimestamp);

    const isValid = totpUtil.verifyCode(secret, pastCode, 1, 30);
    assert.strictEqual(isValid, true, 'Code within +/- 1 step should be accepted');
  });

  it('should reject invalid or malformed OTP codes', () => {
    const secret = totpUtil.generateSecret();
    assert.strictEqual(totpUtil.verifyCode(secret, '000000'), false);
    assert.strictEqual(totpUtil.verifyCode(secret, 'abc123'), false);
    assert.strictEqual(totpUtil.verifyCode(secret, '12345'), false);
    assert.strictEqual(totpUtil.verifyCode(secret, null), false);
  });

  it('should construct a valid otpauth:// URI for authenticator applications', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const uri = totpUtil.getOtpAuthUrl('user@example.com', secret, 'TestAPI');
    assert.ok(uri.startsWith('otpauth://totp/'), 'URI scheme should be otpauth://totp/');
    assert.ok(uri.includes('secret=JBSWY3DPEHPK3PXP'), 'URI should contain secret parameter');
    assert.ok(uri.includes('issuer=TestAPI'), 'URI should contain issuer parameter');
  });
});
