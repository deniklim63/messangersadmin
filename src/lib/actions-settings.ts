"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { SETTING_ANTHROPIC_KEY, SETTING_GEMINI_KEY, setSetting } from "@/lib/settings";

export type SettingsState = { ok?: string; error?: string };

export async function saveSettings(
  _state: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireAuth();
  const key = String(formData.get("anthropicApiKey") ?? "").trim();
  const clear = formData.get("clearAnthropicKey") === "on";

  if (clear) {
    await setSetting(SETTING_ANTHROPIC_KEY, "");
  } else if (key) {
    if (!key.startsWith("sk-ant-")) return { error: "Ключ Anthropic начинается с sk-ant-" };
    await setSetting(SETTING_ANTHROPIC_KEY, key);
  }

  const gemini = String(formData.get("geminiApiKey") ?? "").trim();
  if (formData.get("clearGeminiKey") === "on") {
    await setSetting(SETTING_GEMINI_KEY, "");
  } else if (gemini) {
    await setSetting(SETTING_GEMINI_KEY, gemini);
  }

  revalidatePath("/settings");
  return { ok: "Сохранено" };
}
