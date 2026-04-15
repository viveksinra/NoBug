/** Auto-detect environment information */
export interface EnvironmentInfo {
  url: string;
  browser: string;
  browserVersion: string;
  os: string;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  framework: string | null;
  timestamp: number;
  userAgent: string;
}

/** Detect browser name and version from user agent */
function detectBrowser(): { name: string; version: string } {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox/')) {
    const match = ua.match(/Firefox\/([\d.]+)/);
    return { name: 'Firefox', version: match?.[1] ?? '' };
  }
  if (ua.includes('Edg/')) {
    const match = ua.match(/Edg\/([\d.]+)/);
    return { name: 'Edge', version: match?.[1] ?? '' };
  }
  if (ua.includes('Chrome/')) {
    const match = ua.match(/Chrome\/([\d.]+)/);
    return { name: 'Chrome', version: match?.[1] ?? '' };
  }
  if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    const match = ua.match(/Version\/([\d.]+)/);
    return { name: 'Safari', version: match?.[1] ?? '' };
  }
  return { name: 'Unknown', version: '' };
}

/** Detect OS from user agent */
function detectOS(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return 'Unknown';
}

/** Collect environment info — must be called from content script context */
export function collectEnvironment(): EnvironmentInfo {
  const { name: browser, version: browserVersion } = detectBrowser();

  return {
    url: window.location.href,
    browser,
    browserVersion,
    os: detectOS(),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    framework: detectFramework(),
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
  };
}

/** Detect common frontend frameworks */
function detectFramework(): string | null {
  try {
    if ((window as any).__NEXT_DATA__) return 'Next.js';
    if ((window as any).__NUXT__) return 'Nuxt';
    if (document.querySelector('[data-reactroot]') || document.querySelector('#__next'))
      return 'React';
    if ((window as any).__VUE_DEVTOOLS_GLOBAL_HOOK__) return 'Vue';
    if ((window as any).ng || document.querySelector('[ng-version]')) return 'Angular';
    if ((window as any).__SVELTE_HMR) return 'Svelte';
    if (document.querySelector('[data-astro-cid]')) return 'Astro';
  } catch {
    // Security restrictions
  }
  return null;
}
