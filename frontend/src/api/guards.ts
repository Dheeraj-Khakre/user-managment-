import type { LoginResponseData, MfaSetupData, User, UserStats } from '../types';

const roles = ['ADMIN', 'MODERATOR', 'USER'];
const statuses = ['ACTIVE', 'SUSPENDED', 'PENDING'];

export function isUser(value: unknown): value is User {
  if (!value || typeof value !== 'object') return false;
  const user = value as Record<string, unknown>;
  return typeof user.id === 'string'
    && typeof user.name === 'string'
    && typeof user.email === 'string'
    && roles.includes(String(user.role))
    && statuses.includes(String(user.status))
    && typeof user.isEmailVerified === 'boolean'
    && typeof user.mfaEnabled === 'boolean'
    && typeof user.createdAt === 'string'
    && typeof user.updatedAt === 'string'
    && (user.bio === undefined || typeof user.bio === 'string');
}

export function isUserList(value: unknown): value is User[] {
  return Array.isArray(value) && value.every(isUser);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isUserStats(value: unknown): value is UserStats {
  if (!value || typeof value !== 'object') return false;
  const stats = value as Record<string, unknown>;
  const byRole = stats.byRole as Record<string, unknown> | undefined;
  const byStatus = stats.byStatus as Record<string, unknown> | undefined;
  return isCount(stats.totalUsers)
    && Boolean(byRole && isCount(byRole.ADMIN) && isCount(byRole.MODERATOR) && isCount(byRole.USER))
    && Boolean(byStatus && isCount(byStatus.ACTIVE) && isCount(byStatus.SUSPENDED) && isCount(byStatus.PENDING))
    && isCount(stats.verifiedEmails)
    && isCount(stats.mfaActiveUsers);
}

export function isLoginResponse(value: unknown): value is LoginResponseData {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  if (result.mfaRequired === true) return typeof result.mfaToken === 'string' && result.mfaToken.length > 0;
  return result.mfaRequired !== true && typeof result.accessToken === 'string' && result.accessToken.length > 0 && isUser(result.user);
}

export function isMfaSetup(value: unknown): value is MfaSetupData {
  if (!value || typeof value !== 'object') return false;
  const setup = value as Record<string, unknown>;
  return typeof setup.secret === 'string' && setup.secret.length > 0
    && typeof setup.otpAuthUrl === 'string' && setup.otpAuthUrl.startsWith('otpauth://');
}

export function isLoginSuccess(value: unknown): value is Extract<LoginResponseData, { user: User }> {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return result.mfaRequired !== true && typeof result.accessToken === 'string'
    && result.accessToken.length > 0 && isUser(result.user);
}