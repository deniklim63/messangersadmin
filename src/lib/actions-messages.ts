"use server";

import { revalidatePath } from "next/cache";
import { storeFile, type Attachment } from "@/lib/attachments";
import { requireAuth } from "@/lib/auth";
import { logMessage } from "@/lib/contacts";
import { prisma } from "@/lib/db";
import { isBlankMessage, TELEGRAM_CAPTION_LIMIT, toPlainText, toTelegramHtml } from "@/lib/message-format";
import { sendMessage, sendTelegramMedia, uploadVkDoc, uploadVkPhoto } from "@/lib/platforms";

const MAX_UPLOAD_BYTES = 45 * 1024 * 1024;

export type SendState = { error?: string; ok?: string };

/**
 * Ответ человеку из «Входящих» или карточки: текст с оформлением
 * и, если приложили, картинка, видео или файл.
 */
export async function sendToSubscriber(
  _state: SendState,
  formData: FormData,
): Promise<SendState> {
  await requireAuth();

  const subscriberId = String(formData.get("subscriberId") ?? "");
  const raw = String(formData.get("text") ?? "").trim();
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  if (!hasFile && isBlankMessage(raw)) return { error: "Напишите текст или приложите файл" };

  const subscriber = await prisma.subscriber.findUnique({
    where: { id: subscriberId },
    include: { bot: true },
  });
  if (!subscriber) return { error: "Подписчик не найден" };
  const bot = subscriber.bot;
  if (!bot.token) return { error: "У бота не задан токен" };

  const html = toTelegramHtml(raw);
  const plain = toPlainText(raw);
  const attachments: Attachment[] = [];
  let error: string | undefined;

  if (hasFile) {
    if (file.size > MAX_UPLOAD_BYTES) return { error: "Файл больше 45 МБ" };
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "application/octet-stream";
    const kind: "photo" | "video" | "document" = mime.startsWith("image/")
      ? "photo"
      : mime.startsWith("video/")
        ? "video"
        : "document";

    if (bot.platform === "TELEGRAM") {
      // Подпись к файлу ограничена — длинный текст отправим отдельным сообщением.
      const captionFits = plain.length <= TELEGRAM_CAPTION_LIMIT;
      const result = await sendTelegramMedia(
        bot,
        subscriber.externalId,
        kind,
        { bytes, filename: file.name, mime },
        captionFits ? html : "",
        { html: true },
      );
      if (!result.ok) error = result.error;
      else if (!captionFits && plain) {
        const rest = await sendMessage(bot, subscriber.externalId, html, { html: true });
        if (!rest.ok) error = rest.error;
      }
    } else {
      if (kind === "video") return { error: "Видео во ВКонтакте пока не поддерживается — отправьте ссылку" };
      const uploaded =
        kind === "photo"
          ? await uploadVkPhoto(bot.token, subscriber.externalId, { bytes, filename: file.name, mime })
          : await uploadVkDoc(bot.token, subscriber.externalId, { bytes, filename: file.name, mime });
      if (!uploaded.attachment) error = uploaded.error ?? "ВК не принял файл";
      else {
        const result = await sendMessage(bot, subscriber.externalId, plain, {
          attachment: uploaded.attachment,
        });
        if (!result.ok) error = result.error;
      }
    }

    if (!error) {
      const stored = await storeFile({ bytes, filename: file.name, mime, scope: "message" });
      attachments.push({
        kind: kind === "document" ? "file" : kind,
        fileId: stored,
        name: file.name,
        mime,
        size: bytes.length,
      });
    }
  } else {
    const result = await sendMessage(
      bot,
      subscriber.externalId,
      bot.platform === "TELEGRAM" ? html : plain,
      { html: bot.platform === "TELEGRAM" },
    );
    if (!result.ok) error = result.error;
  }

  if (error) return { error };

  await logMessage({
    botId: bot.id,
    subscriberId: subscriber.id,
    contactId: subscriber.contactId,
    direction: "OUT",
    text: plain,
    attachments,
  });

  revalidatePath(`/contacts/${subscriber.contactId}`);
  return { ok: "Отправлено" };
}

/**
 * Проверка бота: отправить текст по chat_id (Telegram) или user_id (ВК).
 * Telegram разрешает писать только тем, кто уже писал боту.
 */
export async function sendTestMessage(
  _state: SendState,
  formData: FormData,
): Promise<SendState> {
  await requireAuth();

  const botId = String(formData.get("botId") ?? "");
  const externalId = String(formData.get("externalId") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  if (!externalId) return { error: "Укажите chat_id или user_id получателя" };
  if (!text) return { error: "Пустое сообщение" };

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot) return { error: "Бот не найден" };
  if (!bot.token) return { error: "У бота не задан токен" };

  const result = await sendMessage(bot, externalId, text);
  if (!result.ok) return { error: result.error ?? "Платформа не приняла сообщение" };

  // Если человек уже есть в базе — пишем сообщение в его переписку.
  const subscriber = await prisma.subscriber.findUnique({
    where: { botId_externalId: { botId: bot.id, externalId } },
  });
  if (subscriber) {
    await logMessage({
      botId: bot.id,
      subscriberId: subscriber.id,
      contactId: subscriber.contactId,
      direction: "OUT",
      text,
    });
    revalidatePath(`/contacts/${subscriber.contactId}`);
  }

  revalidatePath(`/bots/${bot.id}`);
  return { ok: subscriber ? "Отправлено" : "Отправлено (этого человека ещё нет в базе)" };
}


/** Возвращает диалог боту: после ответа оператора сценарий снова ведёт разговор. */
export async function releaseToBot(formData: FormData): Promise<void> {
  await requireAuth();
  const subscriberId = String(formData.get("subscriberId") ?? "");
  const subscriber = await prisma.subscriber.findUnique({ where: { id: subscriberId } });
  if (!subscriber) return;

  await prisma.subscriber.update({
    where: { id: subscriberId },
    data: { needsOperator: false, operatorSince: null },
  });

  revalidatePath("/inbox");
}
