import { record } from 'rrweb';
import type { eventWithTime } from 'rrweb/typings/types';
import { RollingBuffer, type RecordingMode, type RecordingState } from '@/lib/recording';
import type { ConsoleEntry, ConsolePostMessage } from '@/lib/console-types';
import { MAX_LOG_ENTRIES } from '@/lib/console-types';
import type { NetworkEntry, NetworkPostMessage } from '@/lib/network-types';
import { MAX_NETWORK_ENTRIES } from '@/lib/network-types';
import { hasConsent } from '@/lib/consent';
import { collectEnvironment } from '@/lib/environment';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  async main() {
    // Check GDPR consent before starting any recording
    const consented = await hasConsent();
    if (!consented) {
      console.log('[NoBug] No consent given — recording disabled');
      // Still listen for messages so consent can be checked
      browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.type === 'GET_RECORDING_STATE') {
          sendResponse({
            mode: 'stopped' as RecordingMode,
            isRecording: false,
            eventCount: 0,
            memoryUsageMB: 0,
            isThrottled: false,
            manualStartTime: null,
          } satisfies RecordingState);
        }
      });
      return;
    }
    // =====================================================================
    // rrweb Recording
    // =====================================================================
    let stopRecording: (() => void) | null = null;
    let mode: RecordingMode = 'rolling';
    const rollingBuffer = new RollingBuffer({ bufferWindowMs: 30_000 });
    let manualBuffer: eventWithTime[] = [];
    let manualStartTime: number | null = null;

    function startRecording() {
      if (stopRecording) return;

      stopRecording = record({
        emit(event: eventWithTime) {
          if (mode === 'stopped') return;

          if (rollingBuffer.isThrottled && event.type === 3) {
            return;
          }

          rollingBuffer.push(event);

          if (mode === 'manual') {
            manualBuffer.push(event);
          }
        },
        maskAllInputs: true,
        recordCanvas: false,
        recordCrossOriginIframes: false,
        inlineImages: false,
        sampling: {
          mousemove: true,
          mouseInteraction: true,
          scroll: 150,
          input: 'last',
        },
      }) ?? null;

      notifyRecordingState();
    }

    function stopRecordingFn() {
      if (stopRecording) {
        stopRecording();
        stopRecording = null;
      }
    }

    function getRecordingState(): RecordingState {
      return {
        mode,
        isRecording: stopRecording !== null,
        eventCount: rollingBuffer.getEventCount(),
        memoryUsageMB: Math.round(rollingBuffer.getMemoryUsage() / (1024 * 1024) * 100) / 100,
        isThrottled: rollingBuffer.isThrottled,
        manualStartTime,
      };
    }

    function notifyRecordingState() {
      browser.runtime.sendMessage({
        type: 'RECORDING_STATE',
        payload: getRecordingState(),
      }).catch(() => {});
    }

    // =====================================================================
    // Console Log Buffer
    // =====================================================================
    const consoleLogs: ConsoleEntry[] = [];

    // =====================================================================
    // Network Request Buffer
    // =====================================================================
    const networkLogs: NetworkEntry[] = [];

    // Listen for postMessage from MAIN world scripts (console + network)
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;

      if (event.data?.type === '__NOBUG_CONSOLE__') {
        const data = event.data as ConsolePostMessage;
        consoleLogs.push(data.entry);
        while (consoleLogs.length > MAX_LOG_ENTRIES) {
          consoleLogs.shift();
        }
      } else if (event.data?.type === '__NOBUG_NETWORK__') {
        const data = event.data as NetworkPostMessage;
        networkLogs.push(data.entry);
        while (networkLogs.length > MAX_NETWORK_ENTRIES) {
          networkLogs.shift();
        }
      }
    });

    // =====================================================================
    // Message Handlers
    // =====================================================================
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      switch (message.type) {
        case 'GET_RECORDING_STATE':
          sendResponse(getRecordingState());
          return;

        case 'CAPTURE_BUFFER': {
          const events = rollingBuffer.snapshot();
          sendResponse({
            events,
            consoleLogs: [...consoleLogs],
            networkLogs: [...networkLogs],
            state: getRecordingState(),
          });
          return;
        }

        case 'START_MANUAL_RECORDING': {
          mode = 'manual';
          manualBuffer = [];
          manualStartTime = Date.now();
          if (stopRecording) {
            stopRecordingFn();
          }
          startRecording();
          notifyRecordingState();
          sendResponse({ ok: true });
          return;
        }

        case 'STOP_MANUAL_RECORDING': {
          const events = [...manualBuffer];
          mode = 'rolling';
          manualBuffer = [];
          manualStartTime = null;
          notifyRecordingState();
          sendResponse({
            events,
            consoleLogs: [...consoleLogs],
            networkLogs: [...networkLogs],
            state: getRecordingState(),
          });
          return;
        }

        case 'SET_BUFFER_WINDOW': {
          rollingBuffer.setBufferWindow(message.payload);
          sendResponse({ ok: true });
          return;
        }

        case 'STOP_RECORDING': {
          mode = 'stopped';
          stopRecordingFn();
          rollingBuffer.clear();
          manualBuffer = [];
          manualStartTime = null;
          notifyRecordingState();
          sendResponse({ ok: true });
          return;
        }

        case 'RESUME_RECORDING': {
          mode = 'rolling';
          startRecording();
          sendResponse({ ok: true });
          return;
        }

        case 'GET_CONSOLE_LOGS': {
          sendResponse({ logs: [...consoleLogs] });
          return;
        }

        case 'CLEAR_CONSOLE_LOGS': {
          consoleLogs.length = 0;
          sendResponse({ ok: true });
          return;
        }

        case 'GET_NETWORK_LOGS': {
          sendResponse({ logs: [...networkLogs] });
          return;
        }

        case 'CLEAR_NETWORK_LOGS': {
          networkLogs.length = 0;
          sendResponse({ ok: true });
          return;
        }

        case 'GET_ENVIRONMENT': {
          sendResponse(collectEnvironment());
          return;
        }
      }
    });

    // Start rolling buffer recording immediately
    startRecording();

    console.log('[NoBug] Content script loaded — rrweb recording + console capture active');
  },
});
