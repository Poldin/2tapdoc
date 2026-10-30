import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  logging: {
    serverFunctions: false,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      {
        source: "/prezzi",
        destination: "/#prezzi",
        permanent: true,
      },
      {
        source: "/whatsapp",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
