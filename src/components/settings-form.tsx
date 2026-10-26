"use client";

import { useActionState } from "react";
import { saveSettings, type SettingsState } from "@/lib/actions-settings";

const controlClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

export function SettingsForm({
  masked,
  geminiMasked,
  geminiFromEnv = false,
}: {
  masked: string | null;
  geminiMasked: string | null;
  /** Ключ взят из .env — удалить его из админки нельзя. */
  geminiFromEnv?: boolean;
}) {
  const [state, action, pending] = useActionState(saveSettings, {} as SettingsState);

  return (
    <form action={action} className="mt-4 space-y-3">
      <label className="block text-sm font-medium">
        Ключ Anthropic API
        <input
          name="anthropicApiKey"
          type="password"
          autoComplete="off"
          placeholder={masked ? "оставьте пустым, чтобы не менять" : "sk-ant-…"}
          className={`mt-1 ${controlClass}`}
        />
        <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
          {masked ? `Сейчас: ${masked}` : "Пока не задан — помощник выключен"}
        </span>
      </label>
      {masked ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="clearAnthropicKey" /> Удалить ключ Anthropic
        </label>
      ) : null}

      <label className="block text-sm font-medium">
        Ключ Google Gemini API
        <input
          name="geminiApiKey"
          type="password"
          autoComplete="off"
          placeholder={geminiMasked ? "оставьте пустым, чтобы не менять" : "AIza… или AQ.…"}
          className={`mt-1 ${controlClass}`}
        />
        <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
          {geminiMasked ? `Сейчас: ${geminiMasked}` : "Не задан"}
        </span>
      </label>
      {geminiMasked && !geminiFromEnv ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="clearGeminiKey" /> Удалить ключ Gemini
        </label>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Сохранить
        </button>
        {state.ok ? <span className="text-sm text-green-700">{state.ok}</span> : null}
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
