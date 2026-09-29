import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: "start.getdetailengine.com" }],
          destination: "/start",
        },
      ],
    };
  },
};

export default nextConfig;
