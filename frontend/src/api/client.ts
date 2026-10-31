import type { ApiResponse, ApiErrorResponse, User } from '../types';
import { isUser } from './guards';

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');
let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let onSessionExpired: (() => void) | null = null;

export class ApiClientError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.fields = fields;
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

function getUrl(path: string) {
  const url = new URL(`${apiBase}${path.startsWith('/') ? path : `/${path}`}`, window.location.origin);
  if (import.meta.env.PROD && url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('Secure API connections are required.');
  }
  return url.toString();
}

function validationFields(errors: ApiErrorResponse['errors'] = []) {
  return Object.fromEntries(errors.map(({ field, message }) => [field, message]));
}

async function readJson<T>(response: Response): Promise<ApiResponse<T> | ApiErrorResponse> {
  try {
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object') throw new Error('Invalid response envelope');
    const envelope = result as Record<string, unknown>;
    if (typeof envelope.success !== 'boolean' || typeof envelope.statusCode !== 'number' || typeof envelope.message !== 'string') {
      throw new Error('Invalid response envelope');
    }
    return result as ApiResponse<T> | ApiErrorResponse;
  } catch {
    throw new ApiClientError('The server returned an unreadable response.', response.status);
  }
}

async function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(getUrl('/auth/refresh-token'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) return null;
        const result = await readJson<{ accessToken: string }>(response);
        if (!('data' in result) || typeof result.data.accessToken !== 'string') return null;
        accessToken = result.data.accessToken;
        return accessToken;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export async function restoreSession(): Promise<User | null> {
  const token = await refreshAccessToken();
  if (!token) return null;
  try {
    const result = await request<User>('/auth/me', { retryAuth: false, validateData: isUser });
    return result.data;
  } catch {
    accessToken = null;
    return null;
  }
}

type RequestOptions<T> = RequestInit & { retryAuth?: boolean; validateData?: (data: unknown) => data is T };

export async function request<T>(path: string, options: RequestOptions<T> = {}): Promise<ApiResponse<T>> {
  const { retryAuth = true, validateData, ...init } = options;
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(getUrl(path), {
      ...init,
      headers,
      credentials: 'include',
      signal: init.signal ?? AbortSignal.timeout(12000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiClientError('The request timed out. Please try again.', 0);
    }
    throw new ApiClientError('Unable to reach the service. Check your connection and try again.', 0);
  }

  const noRefreshPaths = ['/auth/login', '/auth/register', '/auth/refresh-token', '/auth/logout', '/auth/forgot-password', '/auth/reset-password', '/auth/mfa/login-step2'];
  if (response.status === 401 && retryAuth && accessToken && !noRefreshPaths.some((item) => path.startsWith(item))) {
    const token = await refreshAccessToken();
    if (token) return request<T>(path, { ...init, retryAuth: false, validateData });
    accessToken = null;
    onSessionExpired?.();
  }

  const result = await readJson<T>(response);
  if (!response.ok || !result.success) {
    const errorResult = result as ApiErrorResponse;
    throw new ApiClientError(
      response.status >= 500 ? 'The service could not complete this request. Please try again shortly.' : errorResult.message || 'The request could not be completed.',
      response.status,
      validationFields(errorResult.errors),
    );
  }
  if (validateData && !validateData(result.data)) throw new ApiClientError('The service returned unexpected data.', response.status);
  return result as ApiResponse<T>;
}

export async function logoutRequest() {
  try {
    await request<null>('/auth/logout', { method: 'POST', body: JSON.stringify({}), retryAuth: false });
  } finally {
    accessToken = null;
  }
}

export function applyLoginToken(token: string) {
  accessToken = token;
}

export type { ApiResponse };