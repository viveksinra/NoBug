import { storage } from 'wxt/utils/storage';
import type { RedactionConfig } from './pii-redaction';
import { DEFAULT_REDACTION_CONFIG } from './pii-redaction';

const redactionStorage = storage.defineItem<RedactionConfig>(
  'local:nobug_redaction_config',
  { fallback: DEFAULT_REDACTION_CONFIG },
);

/** Get the current redaction config */
export async function getRedactionConfig(): Promise<RedactionConfig> {
  return redactionStorage.getValue();
}

/** Update redaction config */
export async function setRedactionConfig(config: RedactionConfig): Promise<void> {
  await redactionStorage.setValue(config);
}

/** Watch for redaction config changes */
export function onRedactionConfigChanged(cb: (config: RedactionConfig) => void) {
  return redactionStorage.watch(cb);
}
