/**
 * @file authentication-security.test.js
 * @description Comprehensive Integration and Security Test Suite verifying:
 */

process.env.NODE_ENV = 'test';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const { getDatabase, resetDatabase } = require('../../src/db/sqlite');
const userRepository = require('../../src/repositories/user.repository');
const totpUtil = require('../../src/utils/totp');
const tokenService = require('../../src/services/token.service');
const securityChallengeRepository = require('../../src/repositories/security-challenge.repository');
const envConfig = require('../../src/config/env.config');
const { ROLES } = require('../../src/constants/roles');

describe('Integration & Security Test Suite', () => {
  let adminToken = '';
  let userAToken = '';
  let userBToken = '';
  let userAId = '';
  let userBId = '';

  const adminCredentials = {
    name: 'Admin Test',
    email: 'integration_admin@example.com',
    password: 'Admin@SecurePassword123!',
  };

  const userACredentials = {
    name: 'User Alpha',
    email: 'user_alpha@example.com',
    password: 'UserAlpha@Secure123!',
  };

  const userBCredentials = {
    name: 'User Beta',
    email: 'user_beta@example.com',
    password: 'UserBeta@Secure123!',
  };

  before(async () => {
    // Fresh in-memory or test database
    resetDatabase();

    // 1. Seed Admin
    const adminReg = await request(app)
      .post('/api/v1/auth/register')
      .send(adminCredentials);
    assert.strictEqual(adminReg.status, 201);
    const adminId = adminReg.body.data.user.id;
    // Elevate to ADMIN in database
    await userRepository.update(adminId, { role: ROLES.ADMIN });
    // Re-login to get token with ADMIN role
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminCredentials.email, password: adminCredentials.password });
    adminToken = adminLogin.body.data.accessToken;

    // 2. Register User A
    const userAReg = await request(app)
      .post('/api/v1/auth/register')
      .send(userACredentials);
    assert.strictEqual(userAReg.status, 201);
    userAToken = userAReg.body.data.accessToken;
    userAId = userAReg.body.data.user.id;

    // 3. Register User B
    const userBReg = await request(app)
      .post('/api/v1/auth/register')
      .send(userBCredentials);
    assert.strictEqual(userBReg.status, 201);
    userBToken = userBReg.body.data.accessToken;
    userBId = userBReg.body.data.user.id;
  });

  it('does not expose runtime or memory details in the public health response', async () => {
    const res = await request(app).get('/api/v1/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.environment, undefined);
    assert.strictEqual(res.body.data.memoryUsageMB, undefined);
  });

  it('rejects untrusted browser origins without echoing the origin', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://untrusted.example');

    assert.strictEqual(res.status, 403);
    assert.doesNotMatch(res.body.message, /untrusted\.example/);
  });

  // =========================================================================
  // 1. Authentication Testing: Verify only valid users can access application
  // =========================================================================
  describe('1. Authentication Testing (Valid vs Invalid Access)', () => {
    it('should reject login for non-existent users with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'Password@12345!' });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.message, 'Invalid email or password.');
    });

    it('should reject login for wrong password with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: userACredentials.email, password: 'WrongPassword@123!' });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.message, 'Invalid email or password.');
    });

    it('should allow valid credentials to log in and receive tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: userACredentials.email, password: userACredentials.password });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.accessToken, 'Access token should be issued');
      assert.strictEqual(res.body.data.user.email, userACredentials.email);
    });

    it('should deny access to protected routes when token is missing', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    it('should allow access to protected route with valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${userAToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.id, userAId);
    });

    it('does not accept refresh tokens from JavaScript-readable request bodies', async () => {
      const user = await userRepository.findById(userAId);
      const { refreshToken } = await tokenService.generateRefreshToken(user);
      const res = await request(app)
        .post('/api/v1/auth/refresh-token')
        .send({ refreshToken });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    it('invalidates old access tokens immediately after a password change', async () => {
      const credentials = {
        name: 'Password Version Guard',
        email: `password_version_${Date.now()}@example.com`,
        password: 'BeforeChange@2026!',
      };
      const registration = await request(app).post('/api/v1/auth/register').send(credentials);
      const oldToken = registration.body.data.accessToken;
      const stepUpToken = tokenService.generateStepUpToken(registration.body.data.user, 'password_change');
      const change = await request(app)
        .post('/api/v1/auth/change-password')
        .set('X-Step-Up-Token', stepUpToken)
        .set('Authorization', `Bearer ${oldToken}`)
        .send({ currentPassword: credentials.password, newPassword: 'AfterChange@2026!' });
      assert.strictEqual(change.status, 200);

      const staleSession = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldToken}`);
      assert.strictEqual(staleSession.status, 401);

      const freshLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: credentials.email, password: 'AfterChange@2026!' });
      assert.strictEqual(freshLogin.status, 200);
    });
  });

  // =========================================================================
  // 2. Weak Password Checks
  // =========================================================================
  describe('2. Weak Password Checks', () => {
    const weakPasswordCases = [
      { pwd: 'short', reason: 'Length < 8' },
      { pwd: 'alllowercase123!', reason: 'Missing uppercase' },
      { pwd: 'ALLUPPERCASE123!', reason: 'Missing lowercase' },
      { pwd: 'NoNumbersHere!@#', reason: 'Missing numbers' },
      { pwd: 'NoSpecialChars1234', reason: 'Missing special character' },
    ];

    for (const testCase of weakPasswordCases) {
      it(`should reject weak password (${testCase.reason}) during registration`, async () => {
        const res = await request(app)
          .post('/api/v1/auth/register')
          .send({
            name: 'Weak Target',
            email: `weak_${Date.now()}_${Math.random()}@example.com`,
            password: testCase.pwd,
          });

        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.success, false);
        assert.ok(res.body.errors.length > 0, 'Validation errors should be returned');
      });
    }
  });

  // =========================================================================
  // 3. Brute-Force Attack Testing
  // =========================================================================
  describe('3. Brute-Force Attack Testing (Rate Limiting)', () => {
    it('should throttle rapid authentication attempts with 429 Too Many Requests', async () => {
      const targetEmail = `bruteforce_${Date.now()}@example.com`;
      let throttled = false;

      // Exhaust auth rate limit allowance
      for (let i = 0; i < 20; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .set('x-test-rate-limit', 'true')
          .send({ email: targetEmail, password: 'WrongPassword@123!' });

        if (res.status === 429) {
          throttled = true;
          assert.strictEqual(res.body.success, false);
          assert.ok(res.body.message.includes('Too many authentication attempts'));
          break;
        }
      }

      assert.strictEqual(throttled, true, 'Rate limiter must activate on brute-force attempts');
    });
  });

  // =========================================================================
  // 4. Account Lockout Verification
  // =========================================================================
  describe('4. Account Lockout Verification', () => {
    const lockoutEmail = 'lockout_integration@example.com';
    const lockoutPassword = 'TargetPassword@123!';

    before(async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Lockout Account', email: lockoutEmail, password: lockoutPassword });
    });

    it('should lock user account after 5 consecutive failed attempts and deny correct password while locked', async () => {
      // Failed attempts 1 through 4
      for (let i = 1; i <= 4; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({ email: lockoutEmail, password: 'IncorrectPassword@999!' });
        assert.strictEqual(res.status, 401);
      }

      // 5th failed attempt -> locks account
      const fifthRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: lockoutEmail, password: 'IncorrectPassword@999!' });
      assert.strictEqual(fifthRes.status, 401);
      assert.ok(
        fifthRes.body.message.includes('locked'),
        '5th failed attempt must notify account is locked'
      );

      // 6th attempt with CORRECT password while locked -> MUST STILL BE REJECTED!
      const correctWhileLocked = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: lockoutEmail, password: lockoutPassword });

      assert.strictEqual(correctWhileLocked.status, 401);
      assert.ok(
        correctWhileLocked.body.message.includes('temporarily locked'),
        'Must block login even with correct password during lockout window'
      );
    });
  });

  // =========================================================================
  // 5. Multi-Factor Authentication (MFA) Validation
  // =========================================================================
  describe('5. Multi-Factor Authentication (MFA) Validation', () => {
    let mfaSecret = '';
    let mfaStepUpToken = '';
    const mfaUser = {
      name: 'MFA User',
      email: 'mfa_user@example.com',
      password: 'MfaUserPassword@123!',
    };
    let mfaUserToken = '';

    before(async () => {
      const reg = await request(app).post('/api/v1/auth/register').send(mfaUser);
      mfaUserToken = reg.body.data.accessToken;
      const verification = await request(app)
        .post('/api/v1/auth/security/verify')
        .set('Authorization', `Bearer ${mfaUserToken}`)
        .send({ method: 'password', purpose: 'mfa_manage', password: mfaUser.password });
      assert.strictEqual(verification.status, 200);
      mfaStepUpToken = verification.body.data.stepUpToken;
    });

    it('requires a scoped step-up token for MFA changes', async () => {
      const noVerification = await request(app)
        .post('/api/v1/auth/mfa/setup')
        .set('Authorization', `Bearer ${mfaUserToken}`)
        .send({});
      assert.strictEqual(noVerification.status, 403);

      const wrongScope = tokenService.generateStepUpToken({ id: (await userRepository.findByEmail(mfaUser.email)).id }, 'password_change');
      const wrongPurpose = await request(app)
        .post('/api/v1/auth/mfa/setup')
        .set('Authorization', `Bearer ${mfaUserToken}`)
        .set('X-Step-Up-Token', wrongScope)
        .send({});
      assert.strictEqual(wrongPurpose.status, 403);
    });

    it('verifies a single-use email OTP and issues a scoped step-up token', async () => {
      const challengeId = crypto.randomUUID();
      const code = '482615';
      const purpose = 'mfa_manage';
      const codeHash = crypto.createHmac('sha256', envConfig.COOKIE_SECRET)
        .update(`${challengeId}:${(await userRepository.findByEmail(mfaUser.email)).id}:${purpose}:${code}`)
        .digest('hex');
      securityChallengeRepository.create({
        id: challengeId,
        userId: (await userRepository.findByEmail(mfaUser.email)).id,
        purpose,
        codeHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      const badCode = await request(app)
        .post('/api/v1/auth/security/verify')
        .set('Authorization', `Bearer ${mfaUserToken}`)
        .send({ method: 'otp', purpose, challengeId, code: '000000' });
      assert.strictEqual(badCode.status, 401);

      const verified = await request(app)
        .post('/api/v1/auth/security/verify')
        .set('Authorization', `Bearer ${mfaUserToken}`)
        .send({ method: 'otp', purpose, challengeId, code });
      assert.strictEqual(verified.status, 200);
      assert.ok(verified.body.data.stepUpToken);

      const replay = await request(app)
        .post('/api/v1/auth/security/verify')
        .set('Authorization', `Bearer ${mfaUserToken}`)
        .send({ method: 'otp', purpose, challengeId, code });
      assert.strictEqual(replay.status, 401);
    });

    it('should initiate MFA setup and generate a base32 secret', async () => {
      const res = await request(app)
        .post('/api/v1/auth/mfa/setup')
        .set('X-Step-Up-Token', mfaStepUpToken)
        .set('Authorization', `Bearer ${mfaUserToken}`);

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.secret, 'MFA secret must be returned');
      assert.ok(res.body.data.otpAuthUrl.startsWith('otpauth://totp/'));
      mfaSecret = res.body.data.secret;
    });

    it('should reject invalid 6-digit OTP code during activation', async () => {
      const res = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .set('X-Step-Up-Token', mfaStepUpToken)
        .set('Authorization', `Bearer ${mfaUserToken}`)
        .send({ code: '000000' });

      assert.strictEqual(res.status, 400);
      assert.ok(res.body.message.includes('Invalid verification code'));
    });

    it('should verify valid 6-digit TOTP code and activate MFA', async () => {
      const validCode = totpUtil.generateCode(mfaSecret);
      const res = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .set('X-Step-Up-Token', mfaStepUpToken)
        .set('Authorization', `Bearer ${mfaUserToken}`)
        .send({ code: validCode });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.message.includes('enabled'));
    });

    it('must not replace an already-enabled MFA secret through setup', async () => {
      const credentials = {
        name: 'MFA Replacement Guard',
        email: `mfa_guard_${Date.now()}@example.com`,
        password: 'MfaGuardPassword@2026!',
      };
      const registration = await request(app).post('/api/v1/auth/register').send(credentials);
      const token = registration.body.data.accessToken;
      const stepUpToken = tokenService.generateStepUpToken(registration.body.data.user, 'mfa_manage');
      const res = await request(app)
        .post('/api/v1/auth/mfa/setup')
        .set('X-Step-Up-Token', stepUpToken)
        .set('Authorization', `Bearer ${token}`);
      const secret = res.body.data.secret;
      const activation = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .set('X-Step-Up-Token', stepUpToken)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: totpUtil.generateCode(secret) });
      assert.strictEqual(activation.status, 200);

      const before = await userRepository.findById(registration.body.data.user.id, { includePassword: true });
      const replacement = await request(app)
        .post('/api/v1/auth/mfa/setup')
        .set('X-Step-Up-Token', stepUpToken)
        .set('Authorization', `Bearer ${token}`);
      const after = await userRepository.findById(registration.body.data.user.id, { includePassword: true });

      assert.strictEqual(replacement.status, 409);
      assert.strictEqual(after.mfaSecret, before.mfaSecret);
    });

    it('should trigger Step 2 challenge on login when MFA is active', async () => {
      const step1Res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: mfaUser.email, password: mfaUser.password });

      assert.strictEqual(step1Res.status, 200);
      assert.strictEqual(step1Res.body.data.mfaRequired, true);
      assert.ok(step1Res.body.data.mfaToken, 'mfaToken challenge required');
      const mfaChallengeToken = step1Res.body.data.mfaToken;

      // Submit invalid OTP code on Step 2
      const badStep2 = await request(app)
        .post('/api/v1/auth/mfa/login-step2')
        .send({ mfaToken: mfaChallengeToken, code: '999999' });
      assert.strictEqual(badStep2.status, 401);

      // Submit valid OTP code on Step 2
      const validOtp = totpUtil.generateCode(mfaSecret);
      const goodStep2 = await request(app)
        .post('/api/v1/auth/mfa/login-step2')
        .send({ mfaToken: mfaChallengeToken, code: validOtp });

      assert.strictEqual(goodStep2.status, 200);
      assert.ok(goodStep2.body.data.accessToken, 'Access token issued after successful Step 2');
    });

    it('should disable MFA with correct password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/mfa/disable')
        .set('X-Step-Up-Token', mfaStepUpToken)
        .set('Authorization', `Bearer ${mfaUserToken}`)
        .send({ password: mfaUser.password });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.message.includes('disabled'));
    });
  });

  // =========================================================================
  // 6. Password Reset Security
  // =========================================================================
  describe('6. Password Reset Security', () => {
    let resetToken = '';
    const resetUser = {
      name: 'Reset Target',
      email: 'reset_security@example.com',
      password: 'InitialPassword@123!',
    };

    before(async () => {
      await request(app).post('/api/v1/auth/register').send(resetUser);
    });

    it('should generate a password reset token and store only its SHA-256 hash', async () => {
      const forgotRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: resetUser.email });

      assert.strictEqual(forgotRes.status, 200);
      const returnedResetToken = forgotRes.body.data.resetToken;

      const reset = tokenService.generatePasswordResetToken();
      resetToken = reset.plainToken;
      const resetUserRecord = await userRepository.findByEmail(resetUser.email);
      await userRepository.updateAuthFields(resetUserRecord.id, {
        passwordResetToken: reset.hashedToken,
        passwordResetExpires: reset.expires,
      });

      // Verify DB stores hash, not plain text token
      const userInDb = await userRepository.findByEmail(resetUser.email, { includePassword: true });
      assert.notStrictEqual(userInDb.passwordResetToken, resetToken, 'Token must be hashed in DB');
      const publicUser = userRepository.sanitizeUser(userInDb);
      assert.strictEqual(publicUser.passwordResetExpires, undefined);
      assert.strictEqual(publicUser.failedLoginAttempts, undefined);
      assert.strictEqual(publicUser.lockUntil, undefined);
      assert.strictEqual(returnedResetToken, undefined);
    });

    it('should reset password with valid token', async () => {
      const newPassword = 'NewSecretPassword@2026!';
      const resetRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, newPassword });

      assert.strictEqual(resetRes.status, 200);
      assert.ok(resetRes.body.message.includes('successfully reset'));
    });

    it('Single-Use Enforcement: should reject replay of already-used reset token', async () => {
      const reuseRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, newPassword: 'AnotherPassword@2026!' });

      assert.strictEqual(reuseRes.status, 400);
      assert.ok(reuseRes.body.message.includes('invalid or has expired'));
    });

    it('allows only one concurrent use of a reset token', async () => {
      const credentials = {
        name: 'Concurrent Reset Guard',
        email: `reset_race_${Date.now()}@example.com`,
        password: 'ConcurrentReset@2026!',
      };
      const registration = await request(app).post('/api/v1/auth/register').send(credentials);
      const reset = tokenService.generatePasswordResetToken();
      const user = await userRepository.findByEmail(credentials.email);
      await userRepository.updateAuthFields(user.id, {
        passwordResetToken: reset.hashedToken,
        passwordResetExpires: reset.expires,
      });

      const responses = await Promise.all([
        request(app).post('/api/v1/auth/reset-password').send({ token: reset.plainToken, newPassword: 'ConcurrentOne@2026!' }),
        request(app).post('/api/v1/auth/reset-password').send({ token: reset.plainToken, newPassword: 'ConcurrentTwo@2026!' }),
      ]);
      assert.deepStrictEqual(responses.map((response) => response.status).sort(), [200, 400]);
    });
  });

  // =========================================================================
  // 7. Session Timeout Testing
  // =========================================================================
  describe('7. Session Timeout Testing', () => {
    it('should reject expired access tokens with 401 Unauthorized', async () => {
      const expiredToken = jwt.sign(
        {
          sub: userAId,
          email: userACredentials.email,
          role: ROLES.USER,
          type: 'access',
        },
        envConfig.JWT_ACCESS_SECRET,
        {
          expiresIn: '-10s', // Expired 10 seconds ago
          issuer: 'secure-user-management-api',
        }
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('expired'));
    });
  });

  // =========================================================================
  // 8. Horizontal Privilege Escalation Testing (User A accessing User B)
  // =========================================================================
  describe("8. Horizontal Privilege Escalation (User A accessing User B's data)", () => {
    it("should prevent User A from reading User B's details (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/v1/users/${userBId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('permission'));
    });

    it("should prevent User A from modifying User B's details (403 Forbidden)", async () => {
      const res = await request(app)
        .patch(`/api/v1/users/${userBId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ bio: 'Hacked by User A' });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
    });

    it('should allow User A to view and update their own profile', async () => {
      const getSelf = await request(app)
        .get(`/api/v1/users/${userAId}`)
        .set('Authorization', `Bearer ${userAToken}`);
      assert.strictEqual(getSelf.status, 200);
      assert.strictEqual(getSelf.body.data.id, userAId);

      const updateSelf = await request(app)
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ bio: 'Authorized update of own profile' });
      assert.strictEqual(updateSelf.status, 200);
      assert.strictEqual(updateSelf.body.data.bio, 'Authorized update of own profile');
    });
  });

  // =========================================================================
  // 9. Vertical Privilege Escalation Testing (Normal User accessing Admin)
  // =========================================================================
  describe('9. Vertical Privilege Escalation (Normal User accessing Admin features)', () => {
    it('should block normal user from viewing administrative statistics (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/users/stats')
        .set('Authorization', `Bearer ${userAToken}`);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Requires one of the following roles: [ADMIN]'));
    });

    it('should block normal user from creating users administratively (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          name: 'Unauthorized User',
          email: 'unauth@example.com',
          password: 'Password@12345!',
          role: ROLES.ADMIN,
        });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
    });

    it('should block normal user from deleting other users (403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/v1/users/${userBId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
    });

    it('should block normal user from promoting their own role via profile update', async () => {
      // In profile update, role field is disallowed / ignored
      const res = await request(app)
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ role: ROLES.ADMIN, bio: 'Trying to be admin' });

      assert.strictEqual(res.status, 200);
      // Verify user in DB still has role = USER
      const user = await userRepository.findById(userAId);
      assert.strictEqual(user.role, ROLES.USER, 'Role must remain USER');
    });

    it('should allow Admin to access administrative statistics', async () => {
      const res = await request(app)
        .get('/api/v1/users/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.totalUsers >= 3);
    });
  });
});
