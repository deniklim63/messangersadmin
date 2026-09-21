"use client";

import { useActionState } from "react";
import { createScenario } from "@/lib/actions-scenarios";

const controlClass =
  "rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

export function CreateScenarioForm({
  bots,
}: {
  bots: { id: string; title: string; platform: "TELEGRAM" | "VK" }[];
}) {
  const [state, formAction, pending] = useActionState(createScenario, {} as { error?: string });

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="block text-sm font-medium">
        Бот
        <select name="botId" className={`mt-1 block ${controlClass}`}>
          {bots.map((bot) => (
            <option key={bot.id} value={bot.id}>
              {bot.platform === "TELEGRAM" ? "Telegram" : "ВКонтакте"} · {bot.title}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium">
        Название
        <input name="title" placeholder="Основной сценарий" className={`mt-1 block ${controlClass}`} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Создаю…" : "Создать сценарий"}
      </button>

      {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
