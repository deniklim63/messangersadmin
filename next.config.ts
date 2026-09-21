import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // В домашней папке лежит чужой package-lock.json — явно фиксируем корень проекта.
  turbopack: { root: __dirname },
  experimental: {
    // Рассылка с видео уходит в server action одним куском.
    serverActions: { bodySizeLimit: "50mb" },
  },
  // Проверку типов выполняет deploy.sh на машине разработчика: на VPS с одним ядром
  // и 2 ГБ памяти tsc внутри сборки уводил сервер в своп. (Линт Next 16 при сборке
  // уже не запускает.)
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
