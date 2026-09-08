import type { Platform } from "@/generated/prisma/client";

/** Адрес, который нужно указать в настройках бота на стороне платформы. */
export function webhookUrl(botId: string, platform: Platform): string {
  const base = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
  const path = platform === "TELEGRAM" ? "telegram" : "vk";
  return `${base}/api/webhooks/${path}/${botId}`;
}
