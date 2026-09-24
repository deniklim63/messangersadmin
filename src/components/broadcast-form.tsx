"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { sendBroadcast, type BroadcastState } from "@/lib/actions-broadcast";
import { toTelegramHtml } from "@/lib/message-format";

const controlClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

type Bot = { id: string; title: string; platform: "TELEGRAM" | "VK"; hasToken: boolean };
type City = { slug: string; name: string; count: number };

const FORMAT_BUTTONS = [
  { tag: "b", label: "Ж", title: "Жирный", className: "font-bold" },
  { tag: "i", label: "К", title: "Курсив", className: "italic" },
  { tag: "u", label: "П", title: "Подчёркнутый", className: "underline" },
  { tag: "s", label: "З", title: "Зачёркнутый", className: "line-through" },
] as const;

export function BroadcastForm({
  bots,
  cities,
  botId,
  selectedCities,
  recipients,
}: {
  bots: Bot[];
  cities: City[];
  botId: string;
  selectedCities: string[];
  recipients: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState(sendBroadcast, {} as BroadcastState);
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Местное время из поля — в ISO (UTC) для сервера.
  const [when, setWhen] = useState("");
  const [scheduleInvalid, setScheduleInvalid] = useState(false);
  const scheduledIso = when ? new Date(when).toISOString() : "";

  function pickWhen(value: string) {
    setWhen(value);
    setScheduleInvalid(Boolean(value) && new Date(value).getTime() < Date.now());
  }

  /** Меняет файл и обновляет предпросмотр; старый object URL освобождаем сразу. */
  function pickFile(next: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(next ? URL.createObjectURL(next) : null);
  }

  const isVideo = file?.type.startsWith("video/") ?? false;
  const showPreview = Boolean(text.trim() || file);

  const selectedBot = bots.find((bot) => bot.id === botId);
  const isVk = selectedBot?.platform === "VK";

  function updateQuery(update: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    update(params);
    router.push(`/broadcasts?${params.toString()}`);
  }

  /** Оборачивает выделенный кусок текста в тег — как кнопки в обычном редакторе. */
  function wrap(open: string, close: string) {
    const field = textRef.current;
    if (!field) return;
    const { selectionStart, selectionEnd, value } = field;
    const selected = value.slice(selectionStart, selectionEnd);
    const next =
      value.slice(0, selectionStart) + open + selected + close + value.slice(selectionEnd);
    setText(next);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(selectionStart + open.length, selectionEnd + open.length);
    });
  }

  function insertLink() {
    const url = window.prompt("Адрес ссылки", "https://");
    if (!url) return;
    wrap(`<a href="${url}">`, "</a>");
  }

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        setText("");
        pickFile(null);
        pickWhen("");
        formRef.current?.reset();
      }}
      className="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Бот
          <select
            name="botId"
            value={botId}
            onChange={(event) =>
              updateQuery((params) => params.set("bot", event.target.value))
            }
            className={`mt-1 ${controlClass}`}
          >
            {bots.map((bot) => (
              <option key={bot.id} value={bot.id}>
                {bot.platform === "TELEGRAM" ? "Telegram" : "ВКонтакте"} · {bot.title}
              </option>
            ))}
          </select>
        </label>

        <div className="text-sm font-medium">
          Города
          <div className="mt-1 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-[var(--line)] p-2">
            {cities.length === 0 ? (
              <p className="px-1 text-[var(--muted)]">Городов пока нет</p>
            ) : (
              cities.map((city) => (
                <label key={city.slug} className="flex items-center gap-2 px-1 font-normal">
                  <input
                    type="checkbox"
                    name="city"
                    value={city.slug}
                    checked={selectedCities.includes(city.slug)}
                    onChange={(event) =>
                      updateQuery((params) => {
                        const rest = params.getAll("city").filter((slug) => slug !== city.slug);
                        params.delete("city");
                        for (const slug of rest) params.append("city", slug);
                        if (event.target.checked) params.append("city", city.slug);
                      })
                    }
                  />
                  {city.name}
                  <span className="ml-auto tabular-nums text-[var(--muted)]">{city.count}</span>
                </label>
              ))
            )}
          </div>
          <p className="mt-1 text-xs font-normal text-[var(--muted)]">
            Ничего не отмечено — отправим всем.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-[var(--bg)] px-3 py-2 text-sm">
        Получателей: <b className="tabular-nums">{recipients}</b>
        {selectedBot && !selectedBot.hasToken ? (
          <span className="text-red-600"> · у бота не задан токен</span>
        ) : null}
      </div>

      <div>
        <div className="flex items-center gap-1 text-sm font-medium">Сообщение</div>

        <div className="mt-1 flex flex-wrap gap-1">
          {FORMAT_BUTTONS.map((button) => (
            <button
              key={button.tag}
              type="button"
              title={button.title}
              onClick={() => wrap(`<${button.tag}>`, `</${button.tag}>`)}
              className={`h-8 w-8 rounded-lg border border-[var(--line)] bg-white text-sm hover:border-[var(--accent)] ${button.className}`}
            >
              {button.label}
            </button>
          ))}
          <button
            type="button"
            title="Ссылка"
            onClick={insertLink}
            className="h-8 rounded-lg border border-[var(--line)] bg-white px-3 text-sm hover:border-[var(--accent)]"
          >
            Ссылка
          </button>
        </div>

        <textarea
          ref={textRef}
          name="text"
          rows={6}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Текст новости. Выделите фрагмент и нажмите кнопку сверху."
          className={`mt-2 ${controlClass} font-mono`}
        />

        {isVk ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            ВКонтакте не поддерживает оформление: подписчики получат текст без выделений,
            ссылки — обычным адресом.
          </p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-medium">
          Картинка или видео
          <input
            type="file"
            name="media"
            accept="image/*,video/*"
            onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-[var(--line)] file:bg-white file:px-3 file:py-2 file:text-sm"
          />
        </label>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {file
            ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} МБ`
            : "Картинка до 10 МБ, видео до 45 МБ. Текст уйдёт подписью к файлу."}
        </p>
      </div>

      {showPreview ? (
        <div>
          <div className="text-sm font-medium">Так увидит подписчик</div>
          <div className="mt-1 max-w-sm overflow-hidden rounded-2xl rounded-tl-sm border border-[var(--line)] bg-white shadow-sm">
            {previewUrl ? (
              isVideo ? (
                <video src={previewUrl} controls className="block max-h-72 w-full bg-black" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="block max-h-72 w-full object-cover" />
              )
            ) : null}
            {text.trim() ? (
              <div
                className="whitespace-pre-wrap p-3 text-sm [&_a]:text-[var(--accent)] [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: toTelegramHtml(text) }}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <label className="block text-sm font-medium">
          Отправить позже
          <input
            type="datetime-local"
            value={when}
            onChange={(event) => pickWhen(event.target.value)}
            className={`mt-1 ${controlClass} sm:max-w-xs`}
          />
        </label>
        <input type="hidden" name="scheduledAt" value={scheduledIso} />
        <p className="mt-1 text-xs text-[var(--muted)]">
          {when
            ? scheduleInvalid
              ? "Это время уже прошло"
              : "Уйдёт само в назначенное время — вкладку держать открытой не нужно. Время по вашим часам."
            : "Пусто — отправим сразу."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || recipients === 0 || scheduleInvalid}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending
            ? when
              ? "Планирую…"
              : "Отправляю…"
            : when
              ? `Запланировать (${recipients})`
              : `Отправить (${recipients})`}
        </button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-green-700">{state.ok}</span> : null}
      </div>

      {state.failures?.length ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
          <div className="font-medium text-red-700">Не доставлено:</div>
          <ul className="mt-1 space-y-0.5 text-red-700">
            {state.failures.map((failure) => (
              <li key={failure.name}>
                {failure.name} — {failure.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
