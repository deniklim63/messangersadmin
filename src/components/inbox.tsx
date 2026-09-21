"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { releaseToBot, sendToSubscriber } from "@/lib/actions-messages";
import { AttachmentList } from "@/components/attachment-list";
import { FormatToolbar } from "@/components/format-toolbar";
import { useInboxEvents } from "@/components/use-inbox-events";
import type { Chat, Conversation } from "@/lib/inbox";

// Страховка на случай, если поток событий не проходит: редкий фоновый опрос.
const LIST_POLL_MS = 20000;
const CHAT_POLL_MS = 20000;

/** «5 мин», «2 ч», «3 д» — как в мессенджерах. */
function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} д`;
  return new Date(iso).toLocaleDateString("ru-RU");
}

export function Inbox({
  initialConversations,
  initialChat,
}: {
  initialConversations: Conversation[];
  initialChat: Chat | null;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialChat?.subscriberId ?? null,
  );
  const [chat, setChat] = useState<Chat | null>(initialChat);
  const [query, setQuery] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const loadList = useCallback(async () => {
    try {
      const response = await fetch("/api/inbox", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { conversations: Conversation[] };
      setConversations(data.conversations);
    } catch {
      // молча: следующая попытка через несколько секунд
    }
  }, []);

  const loadChat = useCallback(async (subscriberId: string) => {
    try {
      const response = await fetch(`/api/inbox/${subscriberId}`, { cache: "no-store" });
      if (!response.ok) return;
      setChat((await response.json()) as Chat);
      // Диалог открыт — значит прочитан, гасим бейдж сразу.
      setConversations((list) =>
        list.map((item) =>
          item.subscriberId === subscriberId ? { ...item, unread: 0 } : item,
        ),
      );
    } catch {
      // молча
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(loadList, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [loadList]);

  // Пришло сообщение — сразу обновляем список и открытый диалог.
  useInboxEvents((event) => {
    if (event.type === "read") {
      void loadList();
      return;
    }
    if (event.type !== "incoming") return;
    void loadList();
    if (event.subscriberId && event.subscriberId === selectedId) {
      void loadChat(event.subscriberId);
    }
  });

  useEffect(() => {
    if (!selectedId) return;
    const timer = setInterval(() => void loadChat(selectedId), CHAT_POLL_MS);
    return () => clearInterval(timer);
  }, [selectedId, loadChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [chat?.messages.length, chat?.subscriberId]);

  const visible = conversations.filter((item) => {
    if (onlyUnread && item.unread === 0) return false;
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return (
      item.name.toLowerCase().includes(needle) ||
      item.lastText.toLowerCase().includes(needle) ||
      item.botTitle.toLowerCase().includes(needle)
    );
  });

  async function submit(formData: FormData) {
    if (!selectedId) return;
    setSending(true);
    setError(null);
    const result = await sendToSubscriber({}, formData);
    setSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    formRef.current?.reset();
    setDraft("");
    setFile(null);
    await loadChat(selectedId);
    await loadList();
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
      <aside className="flex w-80 shrink-0 flex-col border-r border-[var(--line)]">
        <div className="space-y-2 border-b border-[var(--line)] p-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по диалогам"
            className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={onlyUnread}
              onChange={(event) => setOnlyUnread(event.target.checked)}
            />
            Только непрочитанные
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted)]">
              {conversations.length === 0 ? "Пока никто не писал." : "Ничего не найдено."}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {visible.map((item) => {
                const active = item.subscriberId === selectedId;
                return (
                  <li key={item.subscriberId}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(item.subscriberId);
                        void loadChat(item.subscriberId);
                      }}
                      className={`w-full px-3 py-3 text-left hover:bg-[var(--bg)] ${
                        active ? "bg-[var(--bg)]" : ""
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`truncate text-sm ${
                            item.unread > 0 ? "font-semibold" : "font-medium"
                          }`}
                        >
                          {item.name}
                        </span>
                        <span className="shrink-0 text-xs text-[var(--muted)]">
                          {ago(item.lastAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-[var(--muted)]">
                          {item.lastDirection === "OUT" ? "Вы: " : ""}
                          {item.lastText}
                        </span>
                        {item.needsOperator ? (
                          <span className="shrink-0 rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-700">
                            оператор
                          </span>
                        ) : null}
                        {item.unread > 0 ? (
                          <span className="shrink-0 rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-medium text-white tabular-nums">
                            {item.unread}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                        {item.botTitle}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!chat ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--muted)]">
            Выберите диалог слева
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{chat.name}</div>
                <div className="truncate text-xs text-[var(--muted)]">
                  {chat.platform === "TELEGRAM" ? "Telegram" : "ВКонтакте"} · {chat.botTitle}
                  {chat.username ? ` · @${chat.username}` : ""}
                  {chat.city ? ` · ${chat.city}` : ""}
                  {chat.status !== "ACTIVE" ? " · заблокировал бота" : ""}
                  {chat.needsOperator ? " · ждёт оператора" : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {chat.needsOperator ? (
                  <form
                    action={async (formData) => {
                      await releaseToBot(formData);
                      await loadChat(chat.subscriberId);
                      await loadList();
                    }}
                  >
                    <input type="hidden" name="subscriberId" value={chat.subscriberId} />
                    <button
                      type="submit"
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700"
                    >
                      Вернуть боту
                    </button>
                  </form>
                ) : null}
                <Link
                  href={`/contacts/${chat.contactId}`}
                  className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
                >
                  Карточка
                </Link>
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
              {chat.messages.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Сообщений пока нет.</p>
              ) : (
                chat.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                      message.direction === "IN"
                        ? "bg-[var(--bg)]"
                        : "ml-auto bg-blue-50 text-blue-900"
                    }`}
                  >
                    {message.text ? <div className="whitespace-pre-wrap">{message.text}</div> : null}
                    <AttachmentList attachments={message.attachments} />
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {new Date(message.createdAt).toLocaleString("ru-RU")}
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <form
              ref={formRef}
              action={submit}
              className="border-t border-[var(--line)] p-3"
            >
              <input type="hidden" name="subscriberId" value={chat.subscriberId} />
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <FormatToolbar textareaRef={textRef} value={draft} onChange={setDraft} compact />
                <label className="cursor-pointer rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs hover:border-[var(--accent)]">
                  📎 Файл
                  <input
                    type="file"
                    name="file"
                    className="sr-only"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                {file ? (
                  <span className="text-xs text-[var(--muted)]">
                    {file.name} · {(file.size / 1024 / 1024).toFixed(1)} МБ
                  </span>
                ) : null}
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  ref={textRef}
                  name="text"
                  rows={2}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ответ пользователю"
                  className="min-w-0 flex-1 resize-none rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {sending ? "…" : "Отправить"}
                </button>
              </div>
              {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
              <p className="mt-1 text-xs text-[var(--muted)]">⌘/Ctrl + Enter — отправить</p>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
