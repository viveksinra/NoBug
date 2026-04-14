import type { eventWithTime } from 'rrweb/typings/types';

export interface RecordingConfig {
  /** Rolling buffer window in milliseconds (default: 30s) */
  bufferWindowMs: number;
  /** Memory cap in bytes (default: 50MB) */
  memoryCap: number;
  /** Mutations per second threshold for throttling */
  mutationThrottlePerSec: number;
}

export const DEFAULT_CONFIG: RecordingConfig = {
  bufferWindowMs: 30_000,
  memoryCap: 50 * 1024 * 1024, // 50MB
  mutationThrottlePerSec: 500,
};

/**
 * Rolling buffer that stores rrweb events within a time window
 * and enforces a memory cap.
 */
export class RollingBuffer {
  private events: eventWithTime[] = [];
  private approximateSize = 0;
  private config: RecordingConfig;

  // Mutation throttling state
  private mutationCount = 0;
  private mutationWindowStart = 0;
  public isThrottled = false;

  constructor(config: Partial<RecordingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Add an event to the buffer */
  push(event: eventWithTime): void {
    // Track mutations for throttling
    if (event.type === 3) {
      // IncrementalSnapshot
      this.trackMutation();
    }

    const eventSize = this.estimateSize(event);

    // Enforce memory cap — drop oldest events aggressively
    while (
      this.approximateSize + eventSize > this.config.memoryCap &&
      this.events.length > 0
    ) {
      const dropped = this.events.shift()!;
      this.approximateSize -= this.estimateSize(dropped);
    }

    this.events.push(event);
    this.approximateSize += eventSize;

    // Trim events outside the rolling window
    this.trimByTime();
  }

  /** Get all buffered events (snapshot) */
  snapshot(): eventWithTime[] {
    this.trimByTime();
    return [...this.events];
  }

  /** Clear the buffer */
  clear(): void {
    this.events = [];
    this.approximateSize = 0;
  }

  /** Get approximate memory usage in bytes */
  getMemoryUsage(): number {
    return this.approximateSize;
  }

  /** Get event count */
  getEventCount(): number {
    return this.events.length;
  }

  /** Update the buffer window (e.g., switch between 30s and 60s) */
  setBufferWindow(ms: number): void {
    this.config.bufferWindowMs = ms;
    this.trimByTime();
  }

  private trimByTime(): void {
    if (this.events.length === 0) return;

    const cutoff = Date.now() - this.config.bufferWindowMs;
    while (this.events.length > 0 && this.events[0].timestamp < cutoff) {
      const dropped = this.events.shift()!;
      this.approximateSize -= this.estimateSize(dropped);
    }
  }

  private estimateSize(event: eventWithTime): number {
    // Fast heuristic: JSON.stringify length * 2 (UTF-16 chars)
    // For performance, we use a rough estimate based on event type
    try {
      return JSON.stringify(event).length * 2;
    } catch {
      return 1024; // Fallback estimate
    }
  }

  private trackMutation(): void {
    const now = Date.now();
    if (now - this.mutationWindowStart > 1000) {
      // New 1-second window
      this.mutationCount = 1;
      this.mutationWindowStart = now;
      this.isThrottled = false;
    } else {
      this.mutationCount++;
      if (this.mutationCount > this.config.mutationThrottlePerSec) {
        this.isThrottled = true;
      }
    }
  }
}

/** Recording mode */
export type RecordingMode = 'rolling' | 'manual' | 'stopped';

/** Recording state shared between content script and popup */
export interface RecordingState {
  mode: RecordingMode;
  isRecording: boolean;
  eventCount: number;
  memoryUsageMB: number;
  isThrottled: boolean;
  manualStartTime: number | null;
}
