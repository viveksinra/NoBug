import {
  getAuthState,
  setAuthState,
  clearAuthState,
  refreshAuthState,
  openLoginPage,
  loginWithApiKey,
} from '@/lib/auth';
import { getConsentState, giveConsent, revokeConsent } from '@/lib/consent';
import { getRedactionConfig, setRedactionConfig } from '@/lib/redaction-config';
import { processQueue, getQueueStatus, clearFailedUploads } from '@/lib/upload-queue';
import type { ExtensionMessage } from '@/lib/types';

/** Alarm name for periodic queue processing */
const QUEUE_ALARM_NAME = 'nobug_process_queue';
const QUEUE_ALARM_INTERVAL_MINUTES = 5;

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

  // When the extension is installed or updated, set up alarms and retry queue
  browser.runtime.onInstalled.addListener(async () => {
    console.log('[NoBug] Extension installed/updated — checking auth state');
    await refreshAuthState();

    // Set up periodic alarm for queue processing
    await setupQueueAlarm();

    // Process any pending uploads from a previous session
    processQueue().catch((err) =>
      console.warn('[NoBug] Queue processing failed on install:', err),
    );
  });

  // On service worker startup (e.g., after idle wake), process queue
  setupQueueAlarm().then(() => {
    processQueue().catch((err) =>
      console.warn('[NoBug] Queue processing failed on startup:', err),
    );
  });

  // Handle periodic alarm for queue retry
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === QUEUE_ALARM_NAME) {
      console.log('[NoBug] Queue alarm fired — processing upload queue');
      processQueue().catch((err) =>
        console.warn('[NoBug] Queue processing failed on alarm:', err),
      );
    }
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

      // After login, try to process any queued uploads
      processQueue().catch(() => {});
    }
  });

  // Listen for network reconnect via navigator.onLine changes
  // In service workers, we use the global 'online' event
  self.addEventListener('online', () => {
    console.log('[NoBug] Network reconnected — processing upload queue');
    processQueue().catch((err) =>
      console.warn('[NoBug] Queue processing failed on reconnect:', err),
    );
  });
});

/**
 * Set up the periodic alarm for queue processing.
 * Idempotent — clears existing alarm before creating a new one.
 */
async function setupQueueAlarm(): Promise<void> {
  try {
    await browser.alarms.clear(QUEUE_ALARM_NAME);
    await browser.alarms.create(QUEUE_ALARM_NAME, {
      periodInMinutes: QUEUE_ALARM_INTERVAL_MINUTES,
    });
    console.log(
      `[NoBug] Queue alarm set — every ${QUEUE_ALARM_INTERVAL_MINUTES} minutes`,
    );
  } catch (err) {
    console.warn('[NoBug] Failed to set up queue alarm:', err);
  }
}

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

  // Screenshot messages (handled in SW because captureVisibleTab needs SW context)
  if (message.type === 'CAPTURE_SCREENSHOT') {
    try {
      const dataUrl = await browser.tabs.captureVisibleTab(undefined, {
        format: 'png',
        quality: 100,
      });
      // Store for the annotation editor to pick up
      await browser.storage.local.set({ nobug_screenshot: dataUrl });
      return { dataUrl };
    } catch (err) {
      return { error: String(err) };
    }
  }

  if (message.type === 'OPEN_ANNOTATION_EDITOR') {
    const url = browser.runtime.getURL('/annotate.html');
    await browser.tabs.create({ url });
    return { ok: true };
  }

  if (message.type === 'SCREENSHOT_ANNOTATED') {
    return { ok: true };
  }

  // Consent & redaction messages
  if (message.type === 'GET_CONSENT_STATE') {
    return getConsentState();
  }
  if (message.type === 'GIVE_CONSENT') {
    return giveConsent();
  }
  if (message.type === 'REVOKE_CONSENT') {
    await revokeConsent();
    return { ok: true };
  }
  if (message.type === 'GET_REDACTION_CONFIG') {
    return getRedactionConfig();
  }
  if (message.type === 'SET_REDACTION_CONFIG') {
    await setRedactionConfig(message.payload);
    return { ok: true };
  }

  // Upload queue messages
  if (message.type === 'QUEUE_STATUS') {
    return getQueueStatus();
  }
  if (message.type === 'RETRY_QUEUE') {
    processQueue().catch(() => {});
    return { ok: true };
  }
  if (message.type === 'CLEAR_FAILED_UPLOADS') {
    await clearFailedUploads();
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
