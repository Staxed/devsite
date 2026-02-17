import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), microphone=(), camera=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://github.com https://x.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self';",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/privacy.html",
        destination: "/privacy",
        permanent: true,
      },
      {
        source: "/accessibility.html",
        destination: "/accessibility",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
