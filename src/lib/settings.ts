import { prisma } from "@/lib/db";

export const SETTING_ANTHROPIC_KEY = "anthropicApiKey";
export const SETTING_GEMINI_KEY = "geminiApiKey";
/// «off» — не считать переходы по ссылкам через редирект (по умолчанию считаем).
export const SETTING_LINK_TRACKING = "linkTracking";

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? null;
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
