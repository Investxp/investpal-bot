const path = require('path');

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Frame-Options',        value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://investpal.online https://polymarket.investpal.online https://*.vercel.app http://localhost:*" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-XSS-Protection',       value: '1; mode=block' },
];

const nextConfig = {
  transpilePackages: ['@deriv-com/smartcharts-champion'],
  outputFileTracingRoot: __dirname,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config) => {
    config.resolve.alias['@deriv/core'] = path.join(__dirname, 'packages/core/src');
    return config;
  },
}

module.exports = nextConfig
