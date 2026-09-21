import { prisma } from "@/lib/db";

/** Вложение сообщения — то, что хранится в Message.attachments. */
export type Attachment = {
  kind: "photo" | "video" | "file" | "voice" | "audio";
  /** id записи MediaFile, если файл скачан к нам. */
  fileId?: string;
  /** Внешняя ссылка, если файл не скачивали (например, видео ВКонтакте). */
  url?: string;
  name: string;
  mime?: string;
  size?: number;
};

/** Больше этого не скачиваем: у Telegram лимит для ботов 20 МБ, и базу раздувать незачем. */
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

export async function storeFile(params: {
  bytes: Buffer;
  filename: string;
  mime: string;
  scope: "scenario" | "message";
}): Promise<string> {
  const file = await prisma.mediaFile.create({
    data: {
      filename: params.filename,
      mime: params.mime,
      size: params.bytes.length,
      // Prisma ждёт Uint8Array поверх обычного ArrayBuffer.
      data: new Uint8Array(params.bytes),
      scope: params.scope,
    },
  });
  return file.id;
}

async function fetchBytes(url: string): Promise<{ bytes: Buffer; mime: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_DOWNLOAD_BYTES) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES) return null;
    // Отбрасываем параметры вроде «; charset=…» — в базе нужен чистый тип.
    const mime = (response.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
    return { bytes, mime };
  } catch {
    return null;
  }
}

/** Скачивает файл Telegram по file_id: сначала узнаём путь, потом забираем. */
export async function downloadTelegramFile(
  token: string,
  telegramFileId: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
  try {
    const info = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(telegramFileId)}`,
    );
    const data = (await info.json()) as { ok: boolean; result?: { file_path?: string } };
    if (!data.ok || !data.result?.file_path) return null;
    return fetchBytes(`https://api.telegram.org/file/bot${token}/${data.result.file_path}`);
  } catch {
    return null;
  }
}

type TelegramMessage = {
  photo?: { file_id: string; file_size?: number }[];
  video?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  voice?: { file_id: string; mime_type?: string; file_size?: number; duration?: number };
  audio?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number; title?: string };
  video_note?: { file_id: string; file_size?: number };
};

/** Забирает вложения из сообщения Telegram и складывает к нам. */
export async function collectTelegramAttachments(
  token: string,
  message: TelegramMessage,
): Promise<Attachment[]> {
  const items: { kind: Attachment["kind"]; fileId: string; name: string; mime?: string; size?: number }[] = [];

  if (message.photo?.length) {
    const largest = message.photo[message.photo.length - 1];
    items.push({ kind: "photo", fileId: largest.file_id, name: "photo.jpg", mime: "image/jpeg", size: largest.file_size });
  }
  if (message.video) {
    items.push({ kind: "video", fileId: message.video.file_id, name: message.video.file_name ?? "video.mp4", mime: message.video.mime_type ?? "video/mp4", size: message.video.file_size });
  }
  if (message.video_note) {
    items.push({ kind: "video", fileId: message.video_note.file_id, name: "video-note.mp4", mime: "video/mp4", size: message.video_note.file_size });
  }
  if (message.document) {
    items.push({ kind: "file", fileId: message.document.file_id, name: message.document.file_name ?? "file", mime: message.document.mime_type, size: message.document.file_size });
  }
  if (message.voice) {
    items.push({ kind: "voice", fileId: message.voice.file_id, name: "voice.ogg", mime: message.voice.mime_type ?? "audio/ogg", size: message.voice.file_size });
  }
  if (message.audio) {
    items.push({ kind: "audio", fileId: message.audio.file_id, name: message.audio.file_name ?? message.audio.title ?? "audio.mp3", mime: message.audio.mime_type ?? "audio/mpeg", size: message.audio.file_size });
  }

  const result: Attachment[] = [];
  for (const item of items) {
    const downloaded = item.size && item.size > MAX_DOWNLOAD_BYTES
      ? null
      : await downloadTelegramFile(token, item.fileId);

    if (downloaded) {
      const id = await storeFile({
        bytes: downloaded.bytes,
        filename: item.name,
        mime: item.mime ?? downloaded.mime,
        scope: "message",
      });
      result.push({ kind: item.kind, fileId: id, name: item.name, mime: item.mime ?? downloaded.mime, size: downloaded.bytes.length });
    } else {
      // Слишком большой или не скачался — оставляем запись без файла, чтобы было видно, что он был.
      result.push({ kind: item.kind, name: item.name, mime: item.mime, size: item.size });
    }
  }
  return result;
}

type VkAttachment = {
  type: string;
  photo?: { sizes?: { url: string; width: number; height: number }[] };
  doc?: { url?: string; title?: string; ext?: string; size?: number };
  video?: { title?: string; player?: string; owner_id?: number; id?: number; access_key?: string };
  audio_message?: { link_mp3?: string; link_ogg?: string; duration?: number };
  audio?: { url?: string; artist?: string; title?: string };
};

/** Забирает вложения из сообщения ВКонтакте. Видео ВК скачать нельзя — храним ссылку на плеер. */
export async function collectVkAttachments(attachments: VkAttachment[] | undefined): Promise<Attachment[]> {
  const result: Attachment[] = [];
  for (const item of attachments ?? []) {
    if (item.type === "photo" && item.photo?.sizes?.length) {
      const largest = [...item.photo.sizes].sort((a, b) => b.width * b.height - a.width * a.height)[0];
      const downloaded = await fetchBytes(largest.url);
      if (downloaded) {
        const id = await storeFile({ bytes: downloaded.bytes, filename: "photo.jpg", mime: "image/jpeg", scope: "message" });
        result.push({ kind: "photo", fileId: id, name: "photo.jpg", mime: "image/jpeg", size: downloaded.bytes.length });
      } else {
        result.push({ kind: "photo", name: "photo.jpg", url: largest.url });
      }
    } else if (item.type === "doc" && item.doc?.url) {
      const name = item.doc.title ?? `file.${item.doc.ext ?? "bin"}`;
      const downloaded = item.doc.size && item.doc.size > MAX_DOWNLOAD_BYTES ? null : await fetchBytes(item.doc.url);
      if (downloaded) {
        const id = await storeFile({ bytes: downloaded.bytes, filename: name, mime: downloaded.mime, scope: "message" });
        result.push({ kind: "file", fileId: id, name, mime: downloaded.mime, size: downloaded.bytes.length });
      } else {
        result.push({ kind: "file", name, url: item.doc.url, size: item.doc.size });
      }
    } else if (item.type === "video" && item.video) {
      const link = item.video.player ?? (item.video.owner_id && item.video.id
        ? `https://vk.com/video${item.video.owner_id}_${item.video.id}`
        : undefined);
      result.push({ kind: "video", name: item.video.title ?? "video", url: link });
    } else if (item.type === "audio_message" && (item.audio_message?.link_mp3 || item.audio_message?.link_ogg)) {
      const url = item.audio_message.link_mp3 ?? item.audio_message.link_ogg!;
      const downloaded = await fetchBytes(url);
      if (downloaded) {
        const id = await storeFile({ bytes: downloaded.bytes, filename: "voice.mp3", mime: "audio/mpeg", scope: "message" });
        result.push({ kind: "voice", fileId: id, name: "voice.mp3", mime: "audio/mpeg", size: downloaded.bytes.length });
      } else {
        result.push({ kind: "voice", name: "voice.mp3", url });
      }
    } else if (item.type === "audio" && item.audio) {
      result.push({ kind: "audio", name: [item.audio.artist, item.audio.title].filter(Boolean).join(" — ") || "audio", url: item.audio.url });
    }
  }
  return result;
}

/** Короткая подпись для превью в списке диалогов. */
export function describeAttachments(attachments: Attachment[]): string {
  const labels: Record<Attachment["kind"], string> = {
    photo: "📷 Фото",
    video: "🎬 Видео",
    file: "📎 Файл",
    voice: "🎤 Голосовое",
    audio: "🎵 Аудио",
  };
  return attachments.map((item) => labels[item.kind]).join(", ");
}
