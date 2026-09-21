"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { logMessage } from "@/lib/contacts";
import { prisma } from "@/lib/db";
import {
  isBlankMessage,
  TELEGRAM_CAPTION_LIMIT,
  toPlainText,
  toTelegramHtml,
} from "@/lib/message-format";
import {
  sendMessage,
  sendTelegramMedia,
  uploadVkPhoto,
  type MediaKind,
} from "@/lib/platforms";
import { recipientsWhere } from "@/lib/recipients";

export type BroadcastState = {
  error?: string;
  ok?: string;
  failures?: { name: string; reason: string }[];
};

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 45 * 1024 * 1024;

export async function sendBroadcast(
  _state: BroadcastState,
  formData: FormData,
): Promise<BroadcastState> {
  await requireAuth();

  const botId = String(formData.get("botId") ?? "");
  const cities = formData.getAll("city").map(String).filter(Boolean);
  const raw = String(formData.get("text") ?? "").trim();

  if (!botId) return { error: "Выберите бота" };

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot) return { error: "Бот не найден" };
  if (!bot.token) return { error: "У бота не задан токен" };

  // Медиа
  const file = formData.get("media");
  let media: { kind: MediaKind; bytes: Buffer; filename: string; mime: string } | null = null;

  if (file instanceof File && file.size > 0) {
    const isPhoto = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isPhoto && !isVideo) return { error: "Файл должен быть картинкой или видео" };

    const limit = isPhoto ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
    if (file.size > limit) {
      return {
        error: `Файл больше ${Math.round(limit / 1024 / 1024)} МБ — платформа его не примет`,
      };
    }
    if (isVideo && bot.platform === "VK") {
      return { error: "Видео во ВКонтакте пока не поддерживается — приложите ссылку в тексте" };
    }

    media = {
      kind: isPhoto ? "photo" : "video",
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      mime: file.type,
    };
  }

  if (!media && isBlankMessage(raw)) return { error: "Введите текст или приложите файл" };

  const subscribers = await prisma.subscriber.findMany({
    where: recipientsWhere(botId, cities),
    include: { contact: true },
    orderBy: { createdAt: "asc" },
  });
  if (subscribers.length === 0) return { error: "Под выбор не попал ни один получатель" };

  const html = toTelegramHtml(raw);
  const plain = toPlainText(raw);
  // Подпись к медиа в Telegram ограничена 1024 символами — длинный текст шлём отдельно.
  const captionFits = plain.length <= TELEGRAM_CAPTION_LIMIT;

  let sent = 0;
  const failures: { name: string; reason: string }[] = [];
  let telegramFileId: string | undefined;
  let vkAttachment: string | undefined;

  for (const subscriber of subscribers) {
    const name =
      subscriber.contact.name ??
      subscriber.username ??
      subscriber.contact.phone ??
      subscriber.externalId;

    let error: string | undefined;

    if (media && bot.platform === "TELEGRAM") {
      const result = await sendTelegramMedia(
        bot,
        subscriber.externalId,
        media.kind,
        { fileId: telegramFileId, bytes: media.bytes, filename: media.filename, mime: media.mime },
        captionFits ? html : "",
        { html: true },
      );
      if (result.ok) telegramFileId = result.fileId ?? telegramFileId;
      error = result.ok ? undefined : result.error;

      if (!error && !captionFits && plain) {
        const rest = await sendMessage(bot, subscriber.externalId, html, { html: true });
        error = rest.ok ? undefined : rest.error;
      }
    } else if (media && bot.platform === "VK") {
      if (!vkAttachment) {
        const uploaded = await uploadVkPhoto(bot.token, subscriber.externalId, media);
        if (uploaded.error) return { error: `ВК не принял картинку: ${uploaded.error}` };
        vkAttachment = uploaded.attachment;
      }
      const result = await sendMessage(bot, subscriber.externalId, plain, {
        attachment: vkAttachment,
      });
      error = result.ok ? undefined : result.error;
    } else {
      const result = await sendMessage(
        bot,
        subscriber.externalId,
        bot.platform === "TELEGRAM" ? html : plain,
        { html: bot.platform === "TELEGRAM" },
      );
      error = result.ok ? undefined : result.error;
    }

    if (error) {
      failures.push({ name, reason: error });
      // Заблокировавших бота помечаем, чтобы не долбиться в них следующей рассылкой.
      if (/blocked|deactivated|kicked/i.test(error)) {
        await prisma.subscriber.update({
          where: { id: subscriber.id },
          data: { status: "BLOCKED", unsubscribedAt: new Date() },
        });
      }
    } else {
      sent += 1;
      const mark = media ? (media.kind === "photo" ? "[картинка] " : "[видео] ") : "";
      await logMessage({
        botId: bot.id,
        subscriberId: subscriber.id,
        contactId: subscriber.contactId,
        direction: "OUT",
        text: `${mark}${plain}`.trim(),
      });
    }

    // Telegram разрешает ~30 сообщений в секунду — держимся ниже лимита.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Сохраняем саму рассылку — чтобы потом посмотреть, что именно уходило.
  await prisma.broadcast.create({
    data: {
      botId: bot.id,
      text: raw,
      cities,
      mediaKind: media?.kind ?? null,
      mediaName: media?.filename ?? null,
      recipients: subscribers.length,
      sent,
      failed: failures.length,
      failures: failures.length ? failures : undefined,
    },
  });

  revalidatePath("/broadcasts");
  return {
    ok: `Отправлено: ${sent} из ${subscribers.length}`,
    failures: failures.slice(0, 10),
  };
}
