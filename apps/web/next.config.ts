import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@crypto/protocol'],
  output: 'standalone',
};

export default nextConfig;
