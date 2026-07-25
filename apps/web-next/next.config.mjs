/** @type {import('next').NextConfig} */

// Security response headers for the page origin (mirrors apps/web's nginx set).
// Applied to every route via headers() below.
//
// CSP note: Next injects inline bootstrap <script> and inline styles for
// hydration, so script-src/style-src allow 'unsafe-inline' here (the Vite SPA
// does not need it). Tightening to a strict nonce-based CSP means wiring a nonce
// through middleware + next/script — a per-project follow-up, not a scaffold
// default. connect-src is 'self' (same-origin /api rewrite); add `wss:` if you
// enable the realtime capability.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  {
    // Only honoured over HTTPS (Railway terminates TLS); ignored on local HTTP.
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'Content-Security-Policy',
    value:
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; " +
      "img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
      "script-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'",
  },
];

const nextConfig = {
  // Standalone output → the Docker runner stage copies a self-contained server.
  output: 'standalone',
  // Don't advertise the framework/version (X-Powered-By: Next.js).
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    // Same-origin proxy to the backend (mirrors the Vite dev proxy / nginx setup).
    const api = process.env.API_URL ?? 'http://localhost:3000';
    return [{ source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` }];
  },
};

export default nextConfig;
