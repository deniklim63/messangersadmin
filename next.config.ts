import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // В домашней папке лежит чужой package-lock.json — явно фиксируем корень проекта.
  turbopack: { root: __dirname },
};

export default nextConfig;
