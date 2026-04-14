/** Persisted auth state in chrome.storage.local */
export interface AuthState {
  /** 'session' = cookie-based, 'api_key' = token-based */
  method: 'session' | 'api_key';
  /** User info from the web app */
  user: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  } | null;
  /** Companies the user belongs to */
  companies: CompanyInfo[];
  /** Currently selected company ID */
  activeCompanyId: string | null;
  /** Currently selected project ID */
  activeProjectId: string | null;
  /** API key (only when method === 'api_key') */
  apiKey: string | null;
  /** Session token for session-based auth */
  sessionToken: string | null;
  /** When this state was last refreshed */
  lastRefreshed: number;
}

export interface CompanyInfo {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  key: string;
}

/** Extension popup UI mode derived from auth state */
export type PopupMode =
  | 'not_logged_in'    // Quick Capture only + sign in
  | 'no_company'       // Quick Capture + create team CTA
  | 'full';            // Full feature set with project selector

/** Messages between popup <-> service worker <-> content script */
export type ExtensionMessage =
  // Auth messages
  | { type: 'GET_AUTH_STATE' }
  | { type: 'AUTH_STATE'; payload: AuthState | null }
  | { type: 'LOGIN_VIA_WEB' }
  | { type: 'SET_API_KEY'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'SET_ACTIVE_COMPANY'; payload: string }
  | { type: 'SET_ACTIVE_PROJECT'; payload: string }
  | { type: 'AUTH_CHANGED'; payload: AuthState | null }
  | { type: 'REFRESH_AUTH' }
  // Recording messages (popup -> content script via service worker)
  | { type: 'GET_RECORDING_STATE' }
  | { type: 'RECORDING_STATE'; payload: import('@/lib/recording').RecordingState }
  | { type: 'CAPTURE_BUFFER' }
  | { type: 'START_MANUAL_RECORDING' }
  | { type: 'STOP_MANUAL_RECORDING' }
  | { type: 'SET_BUFFER_WINDOW'; payload: number }
  | { type: 'STOP_RECORDING' }
  | { type: 'RESUME_RECORDING' }
  // Console log messages
  | { type: 'GET_CONSOLE_LOGS' }
  | { type: 'CLEAR_CONSOLE_LOGS' }
  // Network log messages
  | { type: 'GET_NETWORK_LOGS' }
  | { type: 'CLEAR_NETWORK_LOGS' }
  // Screenshot messages
  | { type: 'CAPTURE_SCREENSHOT' }
  | { type: 'SCREENSHOT_CAPTURED'; payload: string }
  | { type: 'OPEN_ANNOTATION_EDITOR' }
  | { type: 'SCREENSHOT_ANNOTATED' }
  // Consent & redaction messages
  | { type: 'GET_CONSENT_STATE' }
  | { type: 'GIVE_CONSENT' }
  | { type: 'REVOKE_CONSENT' }
  | { type: 'GET_REDACTION_CONFIG' }
  | { type: 'SET_REDACTION_CONFIG'; payload: import('@/lib/pii-redaction').RedactionConfig };
