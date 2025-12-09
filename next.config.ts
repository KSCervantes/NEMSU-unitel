import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true, // ✅ REQUIRED for Netlify
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        port: "",
        pathname: "/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
