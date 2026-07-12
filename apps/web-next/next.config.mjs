/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output → the Docker runner stage copies a self-contained server.
  output: 'standalone',
  async rewrites() {
    // Same-origin proxy to the backend (mirrors the Vite dev proxy / nginx setup).
    const api = process.env.API_URL ?? 'http://localhost:3000';
    return [{ source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` }];
  },
};

export default nextConfig;
