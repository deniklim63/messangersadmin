"use client";

import { useActionState, useState } from "react";
import { createBot } from "@/lib/actions-bots";

const inputClass =
  "mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

export function CreateBotForm() {
  const [platform, setPlatform] = useState<"TELEGRAM" | "VK">("TELEGRAM");
  const [state, formAction, pending] = useActionState(createBot, {} as { error?: string });

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex gap-2">
        {(["TELEGRAM", "VK"] as const).map((value) => (
          <label
            key={value}
            className={`cursor-pointer rounded-lg border px-4 py-2 text-sm ${
              platform === value
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--line)]"
            }`}
          >
            <input
              type="radio"
              name="platform"
              value={value}
              checked={platform === value}
              onChange={() => setPlatform(value)}
              className="sr-only"
            />
            {value === "TELEGRAM" ? "Telegram" : "ВКонтакте"}
          </label>
        ))}
      </div>

      <label className="block text-sm font-medium">
        Название
        <input name="title" placeholder="Например, Основной бот" className={inputClass} />
      </label>

      <label className="block text-sm font-medium">
        {platform === "TELEGRAM" ? "Токен от @BotFather" : "Ключ доступа сообщества"}
        <input name="token" className={inputClass} />
      </label>

      {platform === "VK" ? (
        <div className="rounded-lg bg-[var(--bg)] p-3 text-sm text-[var(--muted)]">
          <div className="font-medium text-[var(--ink)]">Где взять ключ</div>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            <li>Сообщество → Управление → Сообщения: включить сообщения и возможности ботов</li>
            <li>
              Управление → <b>Дополнительно</b> → Работа с API → вкладка «Ключи доступа»
            </li>
            <li>«Создать ключ»: отметить сообщения сообщества, управление и фотографии</li>
            <li>Скопировать ключ и вставить в поле выше</li>
          </ol>
          <p className="mt-2">
            Больше ничего искать не нужно: id сообщества, строку подтверждения и адрес сервера
            админка получит сама.
          </p>
        </div>
      ) : null}

      <fieldset className="space-y-2 rounded-lg border border-[var(--line)] p-3">
        <legend className="px-1 text-sm font-medium">Что делает админка</legend>
        <label className="flex gap-2 text-sm">
          <input type="radio" name="collectSurvey" value="off" defaultChecked className="mt-0.5" />
          <span>
            Только собирает данные
            <span className="block text-[var(--muted)]">
              Записывает, кто написал боту, и сохраняет переписку. В диалог не вмешивается —
              подходит для бота со своей логикой.
            </span>
          </span>
        </label>
        <label className="flex gap-2 text-sm">
          <input type="radio" name="collectSurvey" value="on" className="mt-0.5" />
          <span>
            Ведёт анкету
            <span className="block text-[var(--muted)]">
              Бот сам спросит имя, телефон, e-mail и город. Включайте только для бота,
              у которого нет своей логики, иначе ответы будут перебивать друг друга.
            </span>
          </span>
        </label>
      </fieldset>

      {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Создаю…" : "Добавить бота"}
      </button>
    </form>
  );
}
