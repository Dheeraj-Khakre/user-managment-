const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const envConfig = require('../config/env.config');
const emailService = require('./email.service');
const tokenService = require('./token.service');
const userRepository = require('../repositories/user.repository');
const securityChallengeRepository = require('../repositories/security-challenge.repository');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const OTP_RESEND_DELAY_MS = 60 * 1000;
const EMAIL_VERIFICATION_PURPOSE = 'email_verification';

function hashOtp({ id, userId, purpose, code }) {
  return crypto.createHmac('sha256', envConfig.COOKIE_SECRET)
    .update(`${id}:${userId}:${purpose}:${code}`)
    .digest('hex');
}

class SecurityService {
  async requestEmailVerificationOtp(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found.');
    if (user.isEmailVerified) throw ApiError.badRequest('Your email address is already verified.');
    if (!emailService.isConfigured()) {
      return { deliveryAvailable: false, challengeId: null, expiresInSeconds: 0 };
    }

    return this.sendOtp(user, EMAIL_VERIFICATION_PURPOSE);
  }

  async requestStepUpOtp(userId, purpose) {
    const user = await userRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found.');

    const available = user.isEmailVerified && emailService.isConfigured();
    if (!available) {
      return { deliveryAvailable: false, challengeId: null, expiresInSeconds: 0 };
    }

    return this.sendOtp(user, purpose);
  }

  async sendOtp(user, purpose) {
    const since = new Date(Date.now() - OTP_RESEND_DELAY_MS).toISOString();
    if (securityChallengeRepository.hasRecentChallenge(user.id, purpose, since)) {
      throw ApiError.tooManyRequests('A verification code was recently sent. Please wait a minute before requesting another.');
    }

    const id = crypto.randomUUID();
    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + OTP_LIFETIME_MS).toISOString();
    securityChallengeRepository.create({
      id,
      userId: user.id,
      purpose,
      codeHash: hashOtp({ id, userId: user.id, purpose, code }),
      expiresAt,
    });

    try {
      const sent = await emailService.sendSecurityCodeEmail(user.email, code, purpose);
      if (!sent) {
        securityChallengeRepository.delete(id, user.id);
        logger.error('Security verification email delivery is not configured.', { code: 'SMTP_UNAVAILABLE' });
        return { deliveryAvailable: false, challengeId: null, expiresInSeconds: 0 };
      }
    } catch (error) {
      securityChallengeRepository.delete(id, user.id);
      logger.error('Security verification email delivery failed.', { code: error.code || 'SMTP_ERROR' });
      return { deliveryAvailable: false, challengeId: null, expiresInSeconds: 0 };
    }

    return { deliveryAvailable: true, challengeId: id, expiresInSeconds: OTP_LIFETIME_MS / 1000 };
  }

  async verifyEmail(userId, challengeId, code) {
    const user = await userRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found.');
    if (user.isEmailVerified) throw ApiError.badRequest('Your email address is already verified.');

    const challenge = securityChallengeRepository.findActive(challengeId, userId, EMAIL_VERIFICATION_PURPOSE);
    if (!challenge) throw ApiError.unauthorized('Verification code is invalid or expired. Request a new code.');

    const candidate = hashOtp({ id: challengeId, userId, purpose: EMAIL_VERIFICATION_PURPOSE, code });
    const expectedBuffer = Buffer.from(challenge.codeHash, 'hex');
    const candidateBuffer = Buffer.from(candidate, 'hex');
    if (expectedBuffer.length !== candidateBuffer.length || !crypto.timingSafeEqual(expectedBuffer, candidateBuffer)) {
      securityChallengeRepository.recordFailedAttempt(challengeId, userId, EMAIL_VERIFICATION_PURPOSE);
      throw ApiError.unauthorized('Verification code is incorrect.');
    }
    if (!securityChallengeRepository.consume(challengeId, userId, EMAIL_VERIFICATION_PURPOSE, candidate)) {
      throw ApiError.unauthorized('Verification code is invalid, expired, or already used.');
    }

    return userRepository.update(userId, { isEmailVerified: true });
  }

  async verifyStepUp({ userId, purpose, method, challengeId, code, password }) {
    const user = await userRepository.findById(userId, { includePassword: true });
    if (!user) throw ApiError.notFound('User not found.');

    if (method === 'password') {
      if (!await bcrypt.compare(password, user.password)) {
        throw ApiError.unauthorized('Current password is incorrect.');
      }
    } else {
      const challenge = securityChallengeRepository.findActive(challengeId, userId, purpose);
      if (!challenge) throw ApiError.unauthorized('Verification code is invalid or expired. Request a new code.');

      const candidate = hashOtp({ id: challengeId, userId, purpose, code });
      const expectedBuffer = Buffer.from(challenge.codeHash, 'hex');
      const candidateBuffer = Buffer.from(candidate, 'hex');
      if (expectedBuffer.length !== candidateBuffer.length || !crypto.timingSafeEqual(expectedBuffer, candidateBuffer)) {
        securityChallengeRepository.recordFailedAttempt(challengeId, userId, purpose);
        throw ApiError.unauthorized('Verification code is incorrect.');
      }
      if (!securityChallengeRepository.consume(challengeId, userId, purpose, candidate)) {
        throw ApiError.unauthorized('Verification code is invalid, expired, or already used.');
      }
    }

    return tokenService.generateStepUpToken(user, purpose);
  }
}

module.exports = new SecurityService();
