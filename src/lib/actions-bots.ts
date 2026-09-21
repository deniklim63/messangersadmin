"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Platform } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { webhookUrl } from "@/lib/webhook-url";
import {
  deleteTelegramWebhook,
  getTelegramBotInfo,
  getVkGroupByToken,
  setTelegramWebhook,
  setupVkCallback,
} from "@/lib/platforms";

type FormState = { error?: string; ok?: string };

export async function createBot(_state: FormState, formData: FormData): Promise<FormState> {
  await requireAuth();
  const platform = String(formData.get("platform")) as Platform;
  const title = String(formData.get("title") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  if (!title) return { error: "Укажите название" };

  let username: string | null = null;
  let vkGroupId: string | null = String(formData.get("vkGroupId") ?? "").trim() || null;
  let resolvedTitle = title;

  if (platform === "TELEGRAM" && token) {
    const info = await getTelegramBotInfo(token);
    if (!info.ok) return { error: `Telegram не принял токен: ${info.error}` };
    username = info.username ?? null;
  }

  // Для ВКонтакте по ключу сами узнаём сообщество — id и название вводить не нужно.
  if (platform === "VK" && token) {
    const group = await getVkGroupByToken(token);
    if (group.error) return { error: `ВКонтакте не принял ключ: ${group.error}` };
    vkGroupId = group.id ?? null;
    username = group.screenName ?? null;
    if (!formData.get("title") && group.name) resolvedTitle = group.name;
  }

  const bot = await prisma.bot.create({
    data: {
      platform,
      title: resolvedTitle,
      token: token || null,
      username,
      vkGroupId,
      vkConfirmation: String(formData.get("vkConfirmation") ?? "").trim() || null,
      vkSecret: String(formData.get("vkSecret") ?? "").trim() || null,
      collectSurvey: formData.get("collectSurvey") === "on",
    },
  });

  revalidatePath("/bots");
  redirect(`/bots/${bot.id}`);
}

export async function updateBot(_state: FormState, formData: FormData): Promise<FormState> {
  await requireAuth();
  const id = String(formData.get("id"));
  const token = String(formData.get("token") ?? "").trim();

  const bot = await prisma.bot.findUnique({ where: { id } });
  if (!bot) return { error: "Бот не найден" };

  let username = bot.username;
  if (bot.platform === "TELEGRAM" && token && token !== bot.token) {
    const info = await getTelegramBotInfo(token);
    if (!info.ok) return { error: `Telegram не принял токен: ${info.error}` };
    username = info.username ?? null;
  }

  await prisma.bot.update({
    where: { id },
    data: {
      title: String(formData.get("title") ?? "").trim() || bot.title,
      token: token || null,
      username,
      isActive: formData.get("isActive") === "on",
      collectSurvey: formData.get("collectSurvey") === "on",
      vkGroupId: String(formData.get("vkGroupId") ?? "").trim() || null,
      vkConfirmation: String(formData.get("vkConfirmation") ?? "").trim() || null,
      vkSecret: String(formData.get("vkSecret") ?? "").trim() || null,
    },
  });

  revalidatePath(`/bots/${id}`);
  return { ok: "Сохранено" };
}

/** Прописывает адрес этой админки в настройках бота на стороне Telegram. */
export async function connectTelegram(_state: FormState, formData: FormData): Promise<FormState> {
  await requireAuth();
  const id = String(formData.get("id"));
  const bot = await prisma.bot.findUnique({ where: { id } });
  if (!bot?.token) return { error: "Сначала сохраните токен бота" };

  const url = webhookUrl(bot.id, bot.platform);
  if (url.startsWith("http://")) {
    return { error: "Telegram принимает только https. Укажите публичный APP_URL (например, ngrok)." };
  }

  const result = await setTelegramWebhook(bot.token, url, bot.webhookSecret);
  revalidatePath(`/bots/${id}`);
  return result.ok ? { ok: "Webhook подключён" } : { error: result.error };
}

export async function disconnectTelegram(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAuth();
  const bot = await prisma.bot.findUnique({ where: { id: String(formData.get("id")) } });
  if (!bot?.token) return { error: "У бота нет токена" };
  const result = await deleteTelegramWebhook(bot.token);
  revalidatePath(`/bots/${bot.id}`);
  return result.ok ? { ok: "Webhook отключён" } : { error: result.error };
}

export async function deleteBot(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id"));
  const bot = await prisma.bot.findUnique({ where: { id } });
  if (bot?.platform === "TELEGRAM" && bot.token) await deleteTelegramWebhook(bot.token);
  await prisma.bot.delete({ where: { id } });
  revalidatePath("/bots");
  redirect("/bots");
}


/** Настраивает Callback API сообщества за пользователя: ключа достаточно. */
export async function connectVk(_state: FormState, formData: FormData): Promise<FormState> {
  await requireAuth();
  const id = String(formData.get("id"));
  const bot = await prisma.bot.findUnique({ where: { id } });
  if (!bot) return { error: "Бот не найден" };
  if (bot.platform !== "VK") return { error: "Это не сообщество ВКонтакте" };
  if (!bot.token) return { error: "Сначала сохраните ключ доступа сообщества" };

  const url = webhookUrl(bot.id, bot.platform);
  if (url.startsWith("http://")) {
    return { error: "ВКонтакте принимает только https. Укажите публичный APP_URL." };
  }

  const result = await setupVkCallback({
    token: bot.token,
    url,
    secret: bot.webhookSecret,
    title: "Админка",
    // Строку подтверждения сохраняем до добавления сервера: ВКонтакте проверит адрес сразу.
    onConfirmationReady: async (groupId, confirmation) => {
      await prisma.bot.update({
        where: { id },
        data: { vkGroupId: groupId, vkConfirmation: confirmation, vkSecret: bot.webhookSecret },
      });
    },
  });

  if (!result.ok) {
    revalidatePath(`/bots/${id}`);
    return { error: result.error };
  }

  await prisma.bot.update({
    where: { id },
    data: {
      vkGroupId: result.groupId ?? bot.vkGroupId,
      title: bot.title || result.groupName || bot.title,
    },
  });

  revalidatePath(`/bots/${id}`);
  return { ok: `Подключено: ${result.groupName ?? "сообщество"}. События включены.` };
}
