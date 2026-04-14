import { storage } from 'wxt/utils/storage';
import type { AuthState, CompanyInfo } from './types';
import { APP_URL, API_KEY_PREFIX, STORAGE_KEYS } from './constants';

const authStorage = storage.defineItem<AuthState | null>(
  `local:${STORAGE_KEYS.AUTH_STATE}`,
  { fallback: null },
);

/** Get the current persisted auth state */
export async function getAuthState(): Promise<AuthState | null> {
  return authStorage.getValue();
}

/** Persist auth state */
export async function setAuthState(state: AuthState | null): Promise<void> {
  await authStorage.setValue(state);
}

/** Clear auth state (logout) */
export async function clearAuthState(): Promise<void> {
  await authStorage.setValue(null);
}

/** Watch for auth state changes */
export function onAuthStateChanged(cb: (state: AuthState | null) => void) {
  return authStorage.watch(cb);
}

/**
 * Validate a session by calling the web app's session endpoint.
 * Returns user + companies if valid, null otherwise.
 */
export async function validateSession(): Promise<{
  user: AuthState['user'];
  companies: CompanyInfo[];
} | null> {
  try {
    const res = await fetch(`${APP_URL}/api/auth/get-session`, {
      credentials: 'include',
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data?.session?.userId) return null;

    // Fetch user's companies
    const companiesRes = await fetch(`${APP_URL}/api/extension/me`, {
      credentials: 'include',
    });

    let companies: CompanyInfo[] = [];
    if (companiesRes.ok) {
      const companiesData = await companiesRes.json();
      companies = companiesData.companies ?? [];
    }

    return {
      user: {
        id: data.user.id,
        name: data.user.name ?? '',
        email: data.user.email,
        avatar_url: data.user.image ?? null,
      },
      companies,
    };
  } catch {
    return null;
  }
}

/**
 * Validate an API key by calling the web app's extension auth endpoint.
 */
export async function validateApiKey(apiKey: string): Promise<{
  user: AuthState['user'];
  companies: CompanyInfo[];
} | null> {
  if (!apiKey.startsWith(API_KEY_PREFIX)) return null;

  try {
    const res = await fetch(`${APP_URL}/api/extension/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) return null;

    const data = await res.json();
    return {
      user: data.user ?? null,
      companies: data.companies ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * Open the web app login page in a new tab.
 * After login, the extension can validate the session cookie.
 */
export async function openLoginPage(): Promise<void> {
  await browser.tabs.create({
    url: `${APP_URL}/login?ext=1`,
  });
}

/**
 * Refresh auth state from the server and persist it.
 */
export async function refreshAuthState(): Promise<AuthState | null> {
  const current = await getAuthState();

  // Try API key auth first if we have one
  if (current?.method === 'api_key' && current.apiKey) {
    const result = await validateApiKey(current.apiKey);
    if (result) {
      const newState: AuthState = {
        ...current,
        user: result.user,
        companies: result.companies,
        lastRefreshed: Date.now(),
      };
      await setAuthState(newState);
      return newState;
    }
    // API key invalid — clear auth
    await clearAuthState();
    return null;
  }

  // Try session-based auth
  const result = await validateSession();
  if (result) {
    const newState: AuthState = {
      method: 'session',
      user: result.user,
      companies: result.companies,
      activeCompanyId: current?.activeCompanyId ?? result.companies[0]?.id ?? null,
      activeProjectId: current?.activeProjectId ?? null,
      apiKey: null,
      sessionToken: null,
      lastRefreshed: Date.now(),
    };
    await setAuthState(newState);
    return newState;
  }

  // No valid auth
  if (current) {
    await clearAuthState();
  }
  return null;
}

/**
 * Authenticate with an API key and persist the auth state.
 */
export async function loginWithApiKey(apiKey: string): Promise<AuthState | null> {
  const result = await validateApiKey(apiKey);
  if (!result) return null;

  const state: AuthState = {
    method: 'api_key',
    user: result.user,
    companies: result.companies,
    activeCompanyId: result.companies[0]?.id ?? null,
    activeProjectId: null,
    apiKey,
    sessionToken: null,
    lastRefreshed: Date.now(),
  };
  await setAuthState(state);
  return state;
}
