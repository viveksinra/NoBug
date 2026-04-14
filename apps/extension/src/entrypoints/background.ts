import {
  getAuthState,
  setAuthState,
  clearAuthState,
  refreshAuthState,
  openLoginPage,
  loginWithApiKey,
} from '@/lib/auth';
import type { ExtensionMessage } from '@/lib/types';

// Recording message types that should be forwarded to the active tab's content script
const CONTENT_SCRIPT_MESSAGES = new Set([
  'GET_RECORDING_STATE',
  'CAPTURE_BUFFER',
  'START_MANUAL_RECORDING',
  'STOP_MANUAL_RECORDING',
  'SET_BUFFER_WINDOW',
  'STOP_RECORDING',
  'RESUME_RECORDING',
  'GET_CONSOLE_LOGS',
  'CLEAR_CONSOLE_LOGS',
  'GET_NETWORK_LOGS',
  'CLEAR_NETWORK_LOGS',
]);

export default defineBackground(() => {
  console.log('[NoBug] Service worker initialized');

  // Handle messages from popup and content scripts
  browser.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      handleMessage(message).then(sendResponse);
      return true; // Keep the message channel open for async response
    },
  );

  // When the extension is installed or updated, try to refresh auth
  browser.runtime.onInstalled.addListener(async () => {
    console.log('[NoBug] Extension installed/updated — checking auth state');
    await refreshAuthState();
  });

  // Listen for tab updates — when user completes login on web app, refresh auth
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (
      changeInfo.status === 'complete' &&
      tab.url?.includes('/login') &&
      tab.url?.includes('ext=1')
    ) {
      console.log('[NoBug] Detected login page completion — refreshing auth');
      const state = await refreshAuthState();
      browser.runtime
        .sendMessage({ type: 'AUTH_CHANGED', payload: state } satisfies ExtensionMessage)
        .catch(() => {});
    }
  });
});

/** Forward a message to the content script in the active tab */
async function sendToActiveTab(message: ExtensionMessage): Promise<unknown> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    const response = await browser.tabs.sendMessage(tab.id, message);
    return response;
  } catch {
    return null;
  }
}

/** Update the badge based on recording state */
async function updateBadge(isRecording: boolean, isThrottled: boolean) {
  if (isRecording) {
    await browser.action.setBadgeText({ text: isThrottled ? '!' : 'REC' });
    await browser.action.setBadgeBackgroundColor({
      color: isThrottled ? '#eab308' : '#22c55e',
    });
  } else {
    await browser.action.setBadgeText({ text: '' });
  }
}

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  // Forward recording messages to active tab's content script
  if (CONTENT_SCRIPT_MESSAGES.has(message.type)) {
    const response = await sendToActiveTab(message);

    // Update badge when we get recording state
    if (message.type === 'GET_RECORDING_STATE' && response) {
      const state = response as { isRecording: boolean; isThrottled: boolean };
      await updateBadge(state.isRecording, state.isThrottled);
    }

    return response;
  }

  // Handle recording state updates from content script
  if (message.type === 'RECORDING_STATE') {
    const state = message.payload;
    await updateBadge(state.isRecording, state.isThrottled);
    return { ok: true };
  }

  // Auth messages
  switch (message.type) {
    case 'GET_AUTH_STATE':
      return getAuthState();

    case 'LOGIN_VIA_WEB':
      await openLoginPage();
      return { ok: true };

    case 'SET_API_KEY': {
      const state = await loginWithApiKey(message.payload);
      return state;
    }

    case 'LOGOUT':
      await clearAuthState();
      return { ok: true };

    case 'SET_ACTIVE_COMPANY': {
      const current = await getAuthState();
      if (current) {
        await setAuthState({
          ...current,
          activeCompanyId: message.payload,
          activeProjectId: null,
        });
      }
      return { ok: true };
    }

    case 'SET_ACTIVE_PROJECT': {
      const current = await getAuthState();
      if (current) {
        await setAuthState({
          ...current,
          activeProjectId: message.payload,
        });
      }
      return { ok: true };
    }

    case 'REFRESH_AUTH': {
      const state = await refreshAuthState();
      return state;
    }

    default:
      console.warn('[NoBug] Unknown message type:', (message as any).type);
      return null;
  }
}
