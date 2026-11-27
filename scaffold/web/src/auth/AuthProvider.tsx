import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, setSessionExpiredHandler } from '../api/client';
import type { User, WorkspaceMembership } from '../api/types';

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous'; expired: boolean; error: boolean }
  | { status: 'signedIn'; user: User };

interface AuthContextValue {
  state: AuthState;
  /** The workspace being viewed. Null only when the user belongs to none. */
  workspace: WorkspaceMembership | null;
  selectWorkspace: (id: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useSignedInUser(): User {
  const { state } = useAuth();
  if (state.status !== 'signedIn') throw new Error('No signed-in user');
  return state.user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((user) => {
        if (cancelled) return;
        setWorkspaceId(user.workspaces[0]?.id ?? null);
        setState({ status: 'signedIn', user });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const unauthenticated = err instanceof ApiError && err.status === 401;
        setState({ status: 'anonymous', expired: false, error: !unauthenticated });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signedIn = state.status === 'signedIn';
  useEffect(() => {
    if (!signedIn) return;
    setSessionExpiredHandler(() => setState({ status: 'anonymous', expired: true, error: false }));
    return () => setSessionExpiredHandler(null);
  }, [signedIn]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setState({ status: 'anonymous', expired: false, error: false });
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const workspace =
      state.status === 'signedIn' ? (state.user.workspaces.find((w) => w.id === workspaceId) ?? null) : null;
    return { state, workspace, selectWorkspace: setWorkspaceId, logout };
  }, [state, workspaceId, logout]);

  return <AuthContext value={value}>{children}</AuthContext>;
}
