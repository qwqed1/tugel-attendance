import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Telegram туннелі (ngrok, cloudflared) арқылы dev режимінде ашуға рұқсат
  allowedDevOrigins: ["*.ngrok-free.app", "*.trycloudflare.com"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
