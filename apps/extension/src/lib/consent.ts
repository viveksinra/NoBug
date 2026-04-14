import { storage } from 'wxt/utils/storage';

/** GDPR consent state */
export interface ConsentState {
  /** Whether user has given consent */
  consented: boolean;
  /** ISO timestamp of when consent was given */
  consentedAt: string | null;
  /** Version of consent terms accepted */
  consentVersion: string;
}

const CURRENT_CONSENT_VERSION = '1.0';

const consentStorage = storage.defineItem<ConsentState | null>(
  'local:nobug_consent',
  { fallback: null },
);

/** Get current consent state */
export async function getConsentState(): Promise<ConsentState | null> {
  return consentStorage.getValue();
}

/** Check if user has given valid consent */
export async function hasConsent(): Promise<boolean> {
  const state = await consentStorage.getValue();
  return state?.consented === true && state.consentVersion === CURRENT_CONSENT_VERSION;
}

/** Record user consent */
export async function giveConsent(): Promise<ConsentState> {
  const state: ConsentState = {
    consented: true,
    consentedAt: new Date().toISOString(),
    consentVersion: CURRENT_CONSENT_VERSION,
  };
  await consentStorage.setValue(state);
  return state;
}

/** Revoke consent */
export async function revokeConsent(): Promise<void> {
  await consentStorage.setValue({
    consented: false,
    consentedAt: null,
    consentVersion: CURRENT_CONSENT_VERSION,
  });
}

/** Watch for consent changes */
export function onConsentChanged(cb: (state: ConsentState | null) => void) {
  return consentStorage.watch(cb);
}
