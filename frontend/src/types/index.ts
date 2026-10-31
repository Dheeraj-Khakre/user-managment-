/**
 * Data contracts and type definitions for the Futuristic User Management UI.
 * Mapped 1:1 with backend schemas in src/constants/roles.js and src/validators.
 */

export type Role = 'ADMIN' | 'MODERATOR' | 'USER';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  bio?: string;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
  failedLoginAttempts?: number;
  lockUntil?: string | null;
  lastLoginAt?: string | null;
  passwordChangedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface ValidationErrorItem {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  errors?: ValidationErrorItem[];
}

export interface AuthTokens {
  accessToken: string;
}

export interface LoginSuccessData {
  mfaRequired?: false;
  user: User;
  accessToken: string;
}

export interface MfaChallengeData {
  mfaRequired: true;
  mfaToken: string;
  message?: string;
}

export type LoginResponseData = LoginSuccessData | MfaChallengeData;

export interface MfaSetupData {
  secret: string;
  otpAuthUrl: string;
}

export interface UserStats {
  totalUsers: number;
  byRole: {
    ADMIN: number;
    MODERATOR: number;
    USER: number;
  };
  byStatus: {
    ACTIVE: number;
    SUSPENDED: number;
    PENDING: number;
  };
  verifiedEmails: number;
  mfaActiveUsers: number;
}

export interface QueryUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: Role;
  status?: UserStatus;
  sortBy?: 'createdAt' | 'name' | 'email' | 'role' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: Role;
  status?: UserStatus;
  bio?: string;
}

export interface UpdateUserInput {
  name?: string;
  bio?: string;
  role?: Role;
  status?: UserStatus;
  password?: string;
  isEmailVerified?: boolean;
}

