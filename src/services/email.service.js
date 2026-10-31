const nodemailer = require('nodemailer');
const envConfig = require('../config/env.config');

let transport;

const getTransport = () => {
  if (!envConfig.SMTP_HOST) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: envConfig.SMTP_HOST,
      port: envConfig.SMTP_PORT,
      secure: envConfig.SMTP_SECURE,
      ...(envConfig.SMTP_USER ? { auth: { user: envConfig.SMTP_USER, pass: envConfig.SMTP_PASS } } : {}),
    });
  }
  return transport;
};

const buildPasswordResetUrl = (token) => {
  const resetUrl = new URL('/reset-password', envConfig.FRONTEND_URL);
  resetUrl.searchParams.set('token', token);
  return resetUrl.toString();
};

const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

async function sendPasswordResetEmail(email, token) {
  const activeTransport = getTransport();
  if (!activeTransport) return false;

  const resetUrl = buildPasswordResetUrl(token);
  const safeUrl = escapeHtml(resetUrl);
  await activeTransport.sendMail({
    from: envConfig.SMTP_FROM,
    to: email,
    subject: 'Reset your Nexus Control password',
    text: `Use this one-time link to reset your password. It expires in one hour.\n\n${resetUrl}\n\nIf you did not request this, you can ignore this message.`,
    html: `<p>Use this one-time link to reset your password. It expires in one hour.</p><p><a href="${safeUrl}">Reset password</a></p><p>If you did not request this, you can ignore this message.</p>`,
  });
  return true;
}

async function sendSecurityCodeEmail(email, code, purpose) {
  const activeTransport = getTransport();
  if (!activeTransport) return false;

  const action = purpose === 'password_change' ? 'change your password' : 'manage multi-factor authentication';
  await activeTransport.sendMail({
    from: envConfig.SMTP_FROM,
    to: email,
    subject: 'Your Nexus Control verification code',
    text: `Use this one-time code to ${action}: ${code}\n\nIt expires in 10 minutes. If you did not request this, you can ignore this message.`,
    html: `<p>Use this one-time code to ${action}:</p><p style="font-size:24px;font-weight:bold;letter-spacing:5px">${code}</p><p>It expires in 10 minutes. If you did not request this, you can ignore this message.</p>`,
  });
  return true;
}

module.exports = {
  isConfigured: () => Boolean(envConfig.SMTP_HOST),
  sendPasswordResetEmail,
  sendSecurityCodeEmail,
};