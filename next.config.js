/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Ignorer les erreurs TypeScript au build (corrigées phase par phase)
  typescript: {
    ignoreBuildErrors: true,
  },

  // Ignorer les erreurs ESLint au build
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Headers sécurité / RGPD
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
// build 2
