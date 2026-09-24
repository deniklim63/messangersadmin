import { logMessage } from "@/lib/contacts";
import { prisma } from "@/lib/db";
import { TELEGRAM_CAPTION_LIMIT, toPlainText, toTelegramHtml } from "@/lib/message-format";
import {
  explainVkUploadError,
  sendMessage,
  sendTelegramMedia,
  uploadVkPhoto,
  type MediaKind,
} from "@/lib/platforms";
import { recipientsWhere } from "@/lib/recipients";

export type DeliveryResult = {
  ok: boolean;
  error?: string;
  sent: number;
  recipients: number;
  failures: { name: string; reason: string }[];
};

/**
 * Отправляет сохранённую рассылку всем, кто подходит под её сегмент.
 * Вызывается и сразу после создания, и планировщиком — когда подошло время.
 */
export async function deliverBroadcast(broadcastId: string): Promise<DeliveryResult> {
  const broadcast = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    include: { bot: true, media: true },
  });
  if (!broadcast) return { ok: false, error: "Рассылка не найдена", sent: 0, recipients: 0, failures: [] };

  const { bot, media } = broadcast;
  const finish = async (patch: Parameters<typeof prisma.broadcast.update>[0]["data"]) =>
    prisma.broadcast.update({ where: { id: broadcastId }, data: { ...patch, sentAt: new Date() } });

  if (!bot.token) {
    await finish({ status: "DONE", failures: [{ name: "—", reason: "У бота не задан токен" }] });
    return { ok: false, error: "У бота не задан токен", sent: 0, recipients: 0, failures: [] };
  }

  const subscribers = await prisma.subscriber.findMany({
    where: recipientsWhere(bot.id, broadcast.cities),
    include: { contact: true },
    orderBy: { createdAt: "asc" },
  });

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: "SENDING", recipients: subscribers.length },
  });

  const raw = broadcast.text;
  const html = toTelegramHtml(raw);
  const plain = toPlainText(raw);
  // Подпись к медиа в Telegram ограничена 1024 символами — длинный текст шлём отдельно.
  const captionFits = plain.length <= TELEGRAM_CAPTION_LIMIT;
  const mediaKind = (broadcast.mediaKind ?? "photo") as MediaKind;

  let sent = 0;
  const failures: { name: string; reason: string }[] = [];
  let telegramFileId = media?.telegramFileId ?? undefined;
  let vkAttachment = media?.vkAttachment ?? undefined;
  let fatal: string | undefined;

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
        mediaKind,
        {
          fileId: telegramFileId,
          bytes: Buffer.from(media.data),
          filename: media.filename,
          mime: media.mime,
        },
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
        const uploaded = await uploadVkPhoto(bot.token, subscriber.externalId, {
          bytes: Buffer.from(media.data),
          filename: media.filename,
          mime: media.mime,
        });
        if (uploaded.error || !uploaded.attachment) {
          fatal = `ВК не принял картинку: ${explainVkUploadError(uploaded.error ?? "пустой ответ")}`;
          break;
        }
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
      const mark = media ? (mediaKind === "photo" ? "[картинка] " : "[видео] ") : "";
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

  // Идентификаторы у платформ запоминаем — повторная отправка не будет грузить файл заново.
  if (media && (telegramFileId !== media.telegramFileId || vkAttachment !== media.vkAttachment)) {
    await prisma.mediaFile.update({
      where: { id: media.id },
      data: { telegramFileId: telegramFileId ?? null, vkAttachment: vkAttachment ?? null },
    });
  }

  if (fatal) failures.unshift({ name: "—", reason: fatal });

  await finish({
    status: "DONE",
    sent,
    failed: fatal ? subscribers.length - sent : failures.length,
    failures: failures.length ? failures : undefined,
  });

  return { ok: !fatal, error: fatal, sent, recipients: subscribers.length, failures };
}
