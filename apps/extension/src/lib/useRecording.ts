import { useState, useEffect, useCallback } from 'react';
import type { RecordingState } from './recording';
import type { ExtensionMessage } from './types';

const DEFAULT_STATE: RecordingState = {
  mode: 'rolling',
  isRecording: false,
  eventCount: 0,
  memoryUsageMB: 0,
  isThrottled: false,
  manualStartTime: null,
};

export function useRecording() {
  const [state, setState] = useState<RecordingState>(DEFAULT_STATE);

  const fetchState = useCallback(async () => {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'GET_RECORDING_STATE',
      } satisfies ExtensionMessage);
      if (response) {
        setState(response as RecordingState);
      }
    } catch {
      // Content script not available
    }
  }, []);

  useEffect(() => {
    fetchState();
    // Poll every 2 seconds while popup is open
    const interval = setInterval(fetchState, 2000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const captureBuffer = useCallback(async () => {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'CAPTURE_BUFFER',
      } satisfies ExtensionMessage);
      return response as { events: unknown[]; state: RecordingState } | null;
    } catch {
      return null;
    }
  }, []);

  const startManualRecording = useCallback(async () => {
    try {
      await browser.runtime.sendMessage({
        type: 'START_MANUAL_RECORDING',
      } satisfies ExtensionMessage);
      await fetchState();
    } catch {
      // Content script not available
    }
  }, [fetchState]);

  const stopManualRecording = useCallback(async () => {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'STOP_MANUAL_RECORDING',
      } satisfies ExtensionMessage);
      await fetchState();
      return response as { events: unknown[]; state: RecordingState } | null;
    } catch {
      return null;
    }
  }, [fetchState]);

  return {
    state,
    captureBuffer,
    startManualRecording,
    stopManualRecording,
    refresh: fetchState,
  };
}
