import { useState, useEffect, useCallback } from 'react';
import type { AuthState, PopupMode, ExtensionMessage } from './types';

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAuthState = useCallback(async () => {
    try {
      const state = await browser.runtime.sendMessage({
        type: 'GET_AUTH_STATE',
      } satisfies ExtensionMessage);
      setAuthState(state as AuthState | null);
    } catch {
      setAuthState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuthState();

    // Listen for auth changes from the service worker
    const listener = (message: ExtensionMessage) => {
      if (message.type === 'AUTH_CHANGED') {
        setAuthState(message.payload);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [fetchAuthState]);

  const login = useCallback(async () => {
    await browser.runtime.sendMessage({
      type: 'LOGIN_VIA_WEB',
    } satisfies ExtensionMessage);
  }, []);

  const loginWithApiKey = useCallback(async (apiKey: string) => {
    const state = await browser.runtime.sendMessage({
      type: 'SET_API_KEY',
      payload: apiKey,
    } satisfies ExtensionMessage);
    setAuthState(state as AuthState | null);
    return state !== null;
  }, []);

  const logout = useCallback(async () => {
    await browser.runtime.sendMessage({
      type: 'LOGOUT',
    } satisfies ExtensionMessage);
    setAuthState(null);
  }, []);

  const setActiveCompany = useCallback(async (companyId: string) => {
    await browser.runtime.sendMessage({
      type: 'SET_ACTIVE_COMPANY',
      payload: companyId,
    } satisfies ExtensionMessage);
    setAuthState((prev) =>
      prev ? { ...prev, activeCompanyId: companyId, activeProjectId: null } : null,
    );
  }, []);

  const setActiveProject = useCallback(async (projectId: string) => {
    await browser.runtime.sendMessage({
      type: 'SET_ACTIVE_PROJECT',
      payload: projectId,
    } satisfies ExtensionMessage);
    setAuthState((prev) => (prev ? { ...prev, activeProjectId: projectId } : null));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const state = await browser.runtime.sendMessage({
        type: 'REFRESH_AUTH',
      } satisfies ExtensionMessage);
      setAuthState(state as AuthState | null);
    } catch {
      setAuthState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const mode: PopupMode = !authState?.user
    ? 'not_logged_in'
    : authState.companies.length === 0
      ? 'no_company'
      : 'full';

  return {
    authState,
    loading,
    mode,
    login,
    loginWithApiKey,
    logout,
    setActiveCompany,
    setActiveProject,
    refresh,
  };
}
