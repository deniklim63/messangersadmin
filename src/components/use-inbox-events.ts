"use client";

import { useEffect, useRef } from "react";

export type InboxStreamEvent = {
  type: "init" | "incoming" | "read";
  unread: number;
  subscriberId?: string;
  contactId?: string;
};

/**
 * Подписка на поток событий сервера. Браузер сам переподключается при обрыве,
 * а на случай, если поток не проходит (прокси, старый браузер), остаётся редкий опрос.
 */
export function useInboxEvents(
  onEvent: (event: InboxStreamEvent) => void,
  fallbackMs = 20000,
) {
  const handlerRef = useRef(onEvent);

  // Держим ссылку на свежий обработчик, не пересоздавая подключение.
  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let streamAlive = false;
    const source = new EventSource("/api/inbox/events");

    source.onmessage = (message) => {
      streamAlive = true;
      try {
        handlerRef.current(JSON.parse(message.data) as InboxStreamEvent);
      } catch {
        // мусор в потоке игнорируем
      }
    };

    source.onerror = () => {
      streamAlive = false;
    };

    // Страховка: если поток не работает, раз в 20 секунд спрашиваем счётчик сами.
    const timer = setInterval(async () => {
      if (streamAlive) return;
      try {
        const response = await fetch("/api/inbox/unread", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { unread: number };
        handlerRef.current({ type: "init", unread: data.unread });
      } catch {
        // молча
      }
    }, fallbackMs);

    return () => {
      source.close();
      clearInterval(timer);
    };
  }, [fallbackMs]);
}
