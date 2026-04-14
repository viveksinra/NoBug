/** Base URL for the NoBug web app */
export const APP_URL = 'http://localhost:3000';

/** chrome.storage.local keys */
export const STORAGE_KEYS = {
  AUTH_STATE: 'nobug_auth_state',
} as const;

/** API key prefix — must match server-side */
export const API_KEY_PREFIX = 'nb_key_';
