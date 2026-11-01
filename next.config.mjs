/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  async redirects() {
    // Old links and old login tabs used "/?step=", "/?login=" and "/?error=". The query string is kept.
    return ["step", "login", "error"].map((key) => ({
      source: "/",
      has: [{ type: "query", key }],
      destination: "/studio",
      permanent: false,
    }));
  },
};

export default nextConfig;
