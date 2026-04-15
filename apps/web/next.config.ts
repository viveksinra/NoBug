import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  transpilePackages: ['@nobug/shared', '@nobug/db', '@nobug/ui'],
};

// Wrap with Sentry only when DSN is configured
const sentryEnabled = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      // Suppresses source map upload logs during build
      silent: true,
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      disableLogger: true,
      // Don't upload source maps in dev or when no auth token is set
      sourcemaps: {
        disable: !process.env.SENTRY_AUTH_TOKEN,
      },
    })
  : nextConfig;
