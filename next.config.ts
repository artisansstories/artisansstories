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
        hostname: "pub-73657e488694457f96636e2fd0f78dae.r2.dev",
      },
    ],
  },
};

export default nextConfig;
