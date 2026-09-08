"use client";

import { useActionState } from "react";
import { connectTelegram, disconnectTelegram, updateBot } from "@/lib/actions-bots";

type Bot = {
  id: string;
  platform: "TELEGRAM" | "VK";
  title: string;
  token: string | null;
  isActive: boolean;
  collectSurvey: boolean;
  vkGroupId: string | null;
  vkConfirmation: string | null;
  vkSecret: string | null;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

export function BotSettingsForm({ bot }: { bot: Bot }) {
  const [state, formAction, pending] = useActionState(updateBot, {} as {
    error?: string;
    ok?: string;
  });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={bot.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Название
          <input name="title" defaultValue={bot.title} className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          {bot.platform === "TELEGRAM" ? "Токен @BotFather" : "Ключ доступа сообщества"}
          <input name="token" defaultValue={bot.token ?? ""} className={inputClass} />
        </label>
      </div>

      {bot.platform === "VK" ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium">
            ID сообщества
            <input name="vkGroupId" defaultValue={bot.vkGroupId ?? ""} className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            Строка подтверждения
            <input
              name="vkConfirmation"
              defaultValue={bot.vkConfirmation ?? ""}
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-medium">
            Секретный ключ
            <input name="vkSecret" defaultValue={bot.vkSecret ?? ""} className={inputClass} />
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={bot.isActive} />
          Бот включён
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="collectSurvey" defaultChecked={bot.collectSurvey} />
          Спрашивать имя, телефон, e-mail и город
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Сохраняю…" : "Сохранить"}
        </button>
        {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        {state?.ok ? <span className="text-sm text-green-700">{state.ok}</span> : null}
      </div>
    </form>
  );
}

export function TelegramWebhookButtons({ botId }: { botId: string }) {
  const [connectState, connectAction, connecting] = useActionState(connectTelegram, {} as {
    error?: string;
    ok?: string;
  });
  const [disconnectState, disconnectAction, disconnecting] = useActionState(
    disconnectTelegram,
    {} as { error?: string; ok?: string },
  );
  const message = connectState.error ?? connectState.ok ?? disconnectState.error ?? disconnectState.ok;
  const isError = Boolean(connectState.error ?? disconnectState.error);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form action={connectAction}>
        <input type="hidden" name="id" value={botId} />
        <button
          type="submit"
          disabled={connecting}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {connecting ? "Подключаю…" : "Подключить webhook"}
        </button>
      </form>
      <form action={disconnectAction}>
        <input type="hidden" name="id" value={botId} />
        <button
          type="submit"
          disabled={disconnecting}
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-60"
        >
          Отключить
        </button>
      </form>
      {message ? (
        <span className={`text-sm ${isError ? "text-red-600" : "text-green-700"}`}>{message}</span>
      ) : null}
    </div>
  );
}
