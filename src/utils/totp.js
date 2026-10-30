/**
 * @file totp.js
 * @description RFC 6238 Time-Based One-Time Password (TOTP) implementation
 * using Node.js built-in crypto module. Zero external dependencies.
 */

const crypto = require('crypto');

// Standard RFC 4648 Base32 alphabet
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

class TotpUtil {
  /**
   * Generates a random base32 secret string (160 bits / 20 bytes).
   * @param {number} [byteLength=20]
   * @returns {string} Base32 encoded secret
   */
  generateSecret(byteLength = 20) {
    const randomBytes = crypto.randomBytes(byteLength);
    let bits = '';
    let secret = '';

    for (let i = 0; i < randomBytes.length; i++) {
      bits += randomBytes[i].toString(2).padStart(8, '0');
    }

    for (let i = 0; i + 5 <= bits.length; i += 5) {
      const chunk = bits.substr(i, 5);
      secret += BASE32_ALPHABET[parseInt(chunk, 2)];
    }

    return secret;
  }

  /**
   * Decodes a base32 string into a Buffer.
   * @param {string} base32
   * @returns {Buffer}
   */
  base32ToBuffer(base32) {
    const cleanBase32 = base32.toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
    let bits = '';

    for (let i = 0; i < cleanBase32.length; i++) {
      const val = BASE32_ALPHABET.indexOf(cleanBase32[i]);
      if (val === -1) {
        throw new Error(`Invalid base32 character: ${cleanBase32[i]}`);
      }
      bits += val.toString(2).padStart(5, '0');
    }

    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.substr(i, 8), 2));
    }

    return Buffer.from(bytes);
  }

  /**
   * Generates a 6-digit TOTP code for a secret at a given timestamp.
   * @param {string} secret - Base32 secret
   * @param {number} [timeStepWindow=30] - Time window in seconds (default: 30s)
   * @param {number} [timestamp=Date.now()] - Current epoch ms
   * @returns {string} 6-digit zero-padded OTP code
   */
  generateCode(secret, timeStepWindow = 30, timestamp = Date.now()) {
    const key = this.base32ToBuffer(secret);
    const counter = Math.floor(timestamp / 1000 / timeStepWindow);

    // Convert counter into 8-byte big-endian buffer
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));

    // HMAC-SHA1 computation per RFC 6238
    const hmac = crypto.createHmac('sha1', key);
    hmac.update(counterBuffer);
    const digest = hmac.digest();

    // Dynamic truncation per RFC 4226
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);

    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  }

  /**
   * Verifies an entered 6-digit TOTP code with time drift window tolerance.
   * @param {string} secret - Base32 secret
   * @param {string} token - 6-digit code to verify
   * @param {number} [window=1] - Tolerated window steps (+/- 1 step = 30s drift)
   * @param {number} [timeStepWindow=30]
   * @returns {boolean} True if code is valid
   */
  verifyCode(secret, token, window = 1, timeStepWindow = 30) {
    if (!secret || !token) return false;
    const cleanToken = String(token).trim();
    if (!/^\d{6}$/.test(cleanToken)) return false;

    const now = Date.now();
    for (let i = -window; i <= window; i++) {
      const stepTime = now + i * timeStepWindow * 1000;
      const expectedCode = this.generateCode(secret, timeStepWindow, stepTime);
      if (crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(expectedCode))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Constructs an otpauth URL for QR code generation in authenticator apps.
   * @param {string} userEmail
   * @param {string} secret
   * @param {string} [issuer='SecureUserAPI']
   * @returns {string}
   */
  getOtpAuthUrl(userEmail, secret, issuer = 'SecureUserAPI') {
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedUser = encodeURIComponent(userEmail);
    return `otpauth://totp/${encodedIssuer}:${encodedUser}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
  }
}

module.exports = new TotpUtil();
