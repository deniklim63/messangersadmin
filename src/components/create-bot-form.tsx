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
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium">
            ID сообщества
            <input name="vkGroupId" className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            Строка подтверждения
            <input name="vkConfirmation" className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            Секретный ключ
            <input name="vkSecret" className={inputClass} />
          </label>
        </div>
      ) : null}

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
