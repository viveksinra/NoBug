import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@nobug/shared', '@nobug/db', '@nobug/ui'],
};

export default nextConfig;
