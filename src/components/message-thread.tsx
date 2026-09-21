"use client";

import { useEffect, useState } from "react";
import { AttachmentList } from "@/components/attachment-list";
import type { Attachment } from "@/lib/attachments";

export type ThreadMessage = {
  id: string;
  direction: "IN" | "OUT";
  text: string;
  botTitle: string;
  createdAt: string;
  attachments?: Attachment[];
};

const POLL_MS = 3000;
/** В фоне опрашиваем реже: каждый пятый тик, то есть примерно раз в 15 секунд. */
const HIDDEN_EVERY = 5;

/**
 * Переписка с автообновлением: раз в несколько секунд забираем свежие сообщения,
 * чтобы входящие появлялись без перезагрузки страницы.
 */
export function MessageThread({
  contactId,
  initialMessages,
}: {
  contactId: string;
  initialMessages: ThreadMessage[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [live, setLive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let tick = 0;

    async function load(force = false) {
      tick += 1;
      // Пока вкладка свёрнута, дёргаем сервер заметно реже.
      if (!force && document.hidden && tick % HIDDEN_EVERY !== 0) return;
      try {
        const response = await fetch(`/api/contacts/${contactId}/messages`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { messages: ThreadMessage[] };
        if (!cancelled) {
          setMessages(data.messages);
          setLive(true);
        }
      } catch {
        if (!cancelled) setLive(false);
      }
    }

    const onVisible = () => {
      // Вернулись на вкладку — показываем свежее сразу.
      if (!document.hidden) void load(true);
    };

    const timer = setInterval(() => void load(), POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    void load(true);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [contactId]);

  if (messages.length === 0) {
    return <p className="mt-3 text-sm text-[var(--muted)]">Сообщений пока нет.</p>;
  }

  return (
    <>
      {!live ? (
        <p className="mt-2 text-xs text-amber-700">
          Обновление прервалось — проверьте соединение.
        </p>
      ) : null}
      <ul className="mt-3 space-y-2">
        {messages.map((message) => (
          <li
            key={message.id}
            className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
              message.direction === "IN" ? "bg-[var(--bg)]" : "ml-auto bg-blue-50 text-blue-900"
            }`}
          >
            {message.text ? <div className="whitespace-pre-wrap">{message.text}</div> : null}
            <AttachmentList attachments={message.attachments ?? []} />
            <div className="mt-1 text-xs text-[var(--muted)]">
              {message.botTitle} ·{" "}
              {new Date(message.createdAt).toLocaleString("ru-RU")}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
