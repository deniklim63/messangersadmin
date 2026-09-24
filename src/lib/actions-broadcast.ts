"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { deliverBroadcast } from "@/lib/broadcast-delivery";
import { prisma } from "@/lib/db";
import { isBlankMessage } from "@/lib/message-format";
import type { MediaKind } from "@/lib/platforms";
import { recipientsWhere } from "@/lib/recipients";

export type BroadcastState = {
  error?: string;
  ok?: string;
  failures?: { name: string; reason: string }[];
};

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
const MAX_DELAY_DAYS = 60;

function formatWhen(date: Date): string {
  return date.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function sendBroadcast(
  _state: BroadcastState,
  formData: FormData,
): Promise<BroadcastState> {
  await requireAuth();

  const botId = String(formData.get("botId") ?? "");
  const cities = formData.getAll("city").map(String).filter(Boolean);
  const raw = String(formData.get("text") ?? "").trim();
  // Время приходит уже в UTC (ISO) — браузер перевёл из местного.
  const scheduledRaw = String(formData.get("scheduledAt") ?? "").trim();

  if (!botId) return { error: "Выберите бота" };

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot) return { error: "Бот не найден" };
  if (!bot.token) return { error: "У бота не задан токен" };

  let scheduledAt: Date | null = null;
  if (scheduledRaw) {
    scheduledAt = new Date(scheduledRaw);
    if (Number.isNaN(scheduledAt.getTime())) return { error: "Не понял дату отправки" };
    if (scheduledAt.getTime() < Date.now() - 60_000) {
      return { error: "Это время уже прошло — выберите будущее или очистите поле" };
    }
    if (scheduledAt.getTime() > Date.now() + MAX_DELAY_DAYS * 86_400_000) {
      return { error: `Отложить можно не больше чем на ${MAX_DELAY_DAYS} дней` };
    }
  }

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

  const recipients = await prisma.subscriber.count({ where: recipientsWhere(botId, cities) });
  if (recipients === 0) return { error: "Под выбор не попал ни один получатель" };

  const stored = media
    ? await prisma.mediaFile.create({
        data: {
          filename: media.filename,
          mime: media.mime,
          size: media.bytes.length,
          data: new Uint8Array(media.bytes),
          scope: "broadcast",
        },
      })
    : null;

  const broadcast = await prisma.broadcast.create({
    data: {
      botId: bot.id,
      text: raw,
      cities,
      mediaKind: media?.kind ?? null,
      mediaName: media?.filename ?? null,
      mediaId: stored?.id ?? null,
      status: scheduledAt ? "SCHEDULED" : "SENDING",
      scheduledAt,
      recipients,
    },
  });

  if (scheduledAt) {
    revalidatePath("/broadcasts");
    return { ok: `Запланировано на ${formatWhen(scheduledAt)} (Москва), получателей: ${recipients}` };
  }

  const result = await deliverBroadcast(broadcast.id);
  revalidatePath("/broadcasts");
  if (!result.ok) return { error: result.error };
  return {
    ok: `Отправлено: ${result.sent} из ${result.recipients}`,
    failures: result.failures.slice(0, 10),
  };
}

/** Снимает запланированную рассылку — пока она не начала уходить. */
export async function cancelBroadcast(formData: FormData): Promise<void> {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  const broadcast = await prisma.broadcast.findUnique({ where: { id } });
  if (!broadcast || broadcast.status !== "SCHEDULED") return;

  await prisma.broadcast.delete({ where: { id } });
  if (broadcast.mediaId) {
    await prisma.mediaFile.delete({ where: { id: broadcast.mediaId } }).catch(() => null);
  }
  revalidatePath("/broadcasts");
}
