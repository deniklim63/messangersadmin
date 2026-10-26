import { prisma } from "@/lib/db";

export const SETTING_ANTHROPIC_KEY = "anthropicApiKey";
export const SETTING_GEMINI_KEY = "geminiApiKey";
/// «off» — не считать переходы по ссылкам через редирект (по умолчанию считаем).
export const SETTING_LINK_TRACKING = "linkTracking";

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

/** Ключ Gemini: из настроек админки, иначе из GEMINI_API_KEY в .env. */
export async function getGeminiKey(): Promise<string | null> {
  return (await getSetting(SETTING_GEMINI_KEY)) || process.env.GEMINI_API_KEY?.trim() || null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  if (!value) {
    await prisma.appSetting.deleteMany({ where: { key } });
    return;
  }
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
