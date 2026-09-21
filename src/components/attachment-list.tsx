"use client";

import type { Attachment } from "@/lib/attachments";

function formatSize(size?: number): string {
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

/** Вложения сообщения: картинки и видео показываем, файлы даём скачать. */
export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {attachments.map((item, index) => {
        const src = item.fileId ? `/api/files/${item.fileId}` : item.url;

        if (item.kind === "photo" && src) {
          return (
            <a key={index} href={src} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={item.name}
                className="max-h-64 max-w-full rounded-lg border border-[var(--line)] object-contain"
              />
            </a>
          );
        }

        if (item.kind === "video" && item.fileId) {
          return (
            <video
              key={index}
              src={src}
              controls
              preload="metadata"
              className="max-h-64 max-w-full rounded-lg border border-[var(--line)]"
            />
          );
        }

        if ((item.kind === "voice" || item.kind === "audio") && src) {
          return (
            <div key={index} className="space-y-1">
              <audio src={src} controls preload="none" className="max-w-full" />
              <div className="text-xs text-[var(--muted)]">{item.name}</div>
            </div>
          );
        }

        // Файлы, видео ВКонтакте (ссылка на плеер) и всё, что не скачалось.
        return (
          <div
            key={index}
            className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
          >
            <span>{item.kind === "video" ? "🎬" : item.kind === "photo" ? "📷" : "📎"}</span>
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            {item.size ? (
              <span className="shrink-0 text-xs text-[var(--muted)]">{formatSize(item.size)}</span>
            ) : null}
            {item.fileId ? (
              <a
                href={`/api/files/${item.fileId}?download`}
                className="shrink-0 text-[var(--accent)] hover:underline"
              >
                Скачать
              </a>
            ) : item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-[var(--accent)] hover:underline"
              >
                Открыть
              </a>
            ) : (
              <span className="shrink-0 text-xs text-[var(--muted)]">не скачан</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
