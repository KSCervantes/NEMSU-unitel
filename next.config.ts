import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
    ],
    // Optimize images for production
    formats: ['image/avif', 'image/webp'],
  },
  // Next.js 16 automatically handles environment variables
  // No additional configuration needed for Netlify
};

export default nextConfig;
