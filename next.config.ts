import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "pub-0225431098954524b5abd8a1b398b466.r2.dev",
      },
    ],
  },
};

export default nextConfig;
