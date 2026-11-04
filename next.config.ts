import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see Dockerfile).
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "i.discogs.com" }],
  },
};

export default nextConfig;
