/**
 * @file password-validation.unit.test.js
 * @description Unit tests verifying strict password complexity rules.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { passwordConstraint } = require('../../src/validators/auth.validator');

describe('Unit Tests: Weak Password Checks & Complexity Rules', () => {
  it('should reject passwords shorter than 8 characters', () => {
    const result = passwordConstraint.safeParse('Aa1!abc');
    assert.strictEqual(result.success, false);
    assert.ok(result.error.issues.some((i) => i.message.includes('at least 8 characters')));
  });

  it('should reject passwords missing uppercase letters', () => {
    const result = passwordConstraint.safeParse('lowercase123!@#');
    assert.strictEqual(result.success, false);
    assert.ok(result.error.issues.some((i) => i.message.includes('uppercase')));
  });

  it('should reject passwords missing lowercase letters', () => {
    const result = passwordConstraint.safeParse('UPPERCASE123!@#');
    assert.strictEqual(result.success, false);
    assert.ok(result.error.issues.some((i) => i.message.includes('lowercase')));
  });

  it('should reject passwords missing numeric digits', () => {
    const result = passwordConstraint.safeParse('NoNumbersHere!@#');
    assert.strictEqual(result.success, false);
    assert.ok(result.error.issues.some((i) => i.message.includes('number')));
  });

  it('should reject passwords missing special characters', () => {
    const result = passwordConstraint.safeParse('NoSpecialChar1234');
    assert.strictEqual(result.success, false);
    assert.ok(result.error.issues.some((i) => i.message.includes('special character')));
  });

  it('should accept compliant strong passwords', () => {
    const compliantPasswords = [
      'P@ssw0rd2026!',
      'Str0ng#Enterprise$',
      'Admin@SecurePassword123!',
      'Complex.99_Valid',
    ];

    for (const pwd of compliantPasswords) {
      const result = passwordConstraint.safeParse(pwd);
      assert.strictEqual(result.success, true, `Expected "${pwd}" to be accepted`);
    }
  });
});
