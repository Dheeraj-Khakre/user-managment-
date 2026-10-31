import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  applyLoginToken,
  logoutRequest,
  request,
  restoreSession,
  setAccessToken,
  setSessionExpiredHandler,
} from '../api/client';
import { isLoginResponse, isLoginSuccess } from '../api/guards';
import type { LoginResponseData, LoginSuccessData, MfaChallengeData, User } from '../types';

interface AuthContextValue {
  user: User | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<LoginResponseData>;
  signUp: (input: { name: string; email: string; password: string }) => Promise<void>;
  completeMfa: (mfaToken: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    let active = true;
    restoreSession().then((restoredUser) => {
      if (active) {
        setUser(restoredUser);
        setReady(true);
      }
    });
    return () => {
      active = false;
      setSessionExpiredHandler(null);
    };
  }, []);

  async function signIn(email: string, password: string) {
    const response = await request<LoginResponseData>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      retryAuth: false,
      validateData: isLoginResponse,
    });
    const data = response.data;
    if (!data.mfaRequired) {
      applyLoginToken(data.accessToken);
      setUser(data.user);
    }
    return data;
  }

  async function signUp(input: { name: string; email: string; password: string }) {
    const response = await request<LoginSuccessData>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
      retryAuth: false,
      validateData: isLoginSuccess,
    });
    applyLoginToken(response.data.accessToken);
    setUser(response.data.user);
  }

  async function completeMfa(mfaToken: string, code: string) {
    const response = await request<LoginSuccessData>('/auth/mfa/login-step2', {
      method: 'POST',
      body: JSON.stringify({ mfaToken, code }),
      retryAuth: false,
      validateData: isLoginSuccess,
    });
    applyLoginToken(response.data.accessToken);
    setUser(response.data.user);
  }

  async function signOut() {
    try {
      await logoutRequest();
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, ready, signIn, signUp, completeMfa, signOut, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}

export type { MfaChallengeData };