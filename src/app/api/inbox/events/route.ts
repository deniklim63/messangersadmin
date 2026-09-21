import { isAuthenticated } from "@/lib/auth";
import { inboxEvents, type InboxEvent } from "@/lib/events";
import { countUnread } from "@/lib/inbox";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25000;

/**
 * Поток событий для открытых вкладок (Server-Sent Events):
 * как только приходит сообщение от пользователя, браузер узнаёт об этом сразу,
 * без опроса раз в несколько секунд.
 */
export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return new Response("Нужна авторизация", { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const write = (payload: object) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const onEvent = async (event: InboxEvent) => {
        write({ ...event, unread: await countUnread() });
      };

      // Первым делом отдаём текущее состояние, чтобы вкладка не ждала события.
      write({ type: "init", unread: await countUnread() });

      inboxEvents.on("inbox", onEvent);

      // Комментарий-пульс держит соединение живым через прокси.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, HEARTBEAT_MS);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        inboxEvents.off("inbox", onEvent);
        try {
          controller.close();
        } catch {
          // соединение уже закрыто браузером
        }
      };

      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Просим nginx не буферизовать поток, иначе события копятся и приходят пачкой.
      "x-accel-buffering": "no",
    },
  });
}
