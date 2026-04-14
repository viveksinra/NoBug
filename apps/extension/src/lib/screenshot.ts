/** Screenshot capture result */
export interface ScreenshotResult {
  /** Base64-encoded PNG data URL */
  dataUrl: string;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Timestamp */
  timestamp: number;
}

/** Annotation tool types */
export type AnnotationTool =
  | 'arrow'
  | 'rectangle'
  | 'ellipse'
  | 'freehand'
  | 'text'
  | 'blur'
  | 'select';

/** Stored annotation data for re-rendering */
export interface AnnotationData {
  /** Fabric.js canvas JSON */
  canvasJson: string;
  /** Tool history for undo/redo */
  version: number;
}

/**
 * Capture the visible viewport as a PNG screenshot.
 * Must be called from the service worker (has access to chrome.tabs).
 */
export async function captureVisibleTab(): Promise<string> {
  const dataUrl = await browser.tabs.captureVisibleTab(undefined, {
    format: 'png',
    quality: 100,
  });
  return dataUrl;
}
