"use client";

import { useActionState, useRef, useState } from "react";
import { FormatToolbar } from "@/components/format-toolbar";
import { sendTestMessage, sendToSubscriber, type SendState } from "@/lib/actions-messages";

const inputClass =
  "w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

type Target = {
  subscriberId: string;
  label: string;
};

/** Написать человеку из его карточки. */
export function SendToContactForm({ targets }: { targets: Target[] }) {
  const [state, formAction, pending] = useActionState(sendToSubscriber, {} as SendState);
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);

  if (targets.length === 0) {
    return (
      <p className="mt-3 text-sm text-[var(--muted)]">
        Написать некому: человек не привязан ни к одному боту.
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
        setDraft("");
        setFile(null);
      }}
      className="mt-3 space-y-3"
    >
      {targets.length > 1 ? (
        <select name="subscriberId" className={inputClass}>
          {targets.map((target) => (
            <option key={target.subscriberId} value={target.subscriberId}>
              {target.label}
            </option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="subscriberId" value={targets[0].subscriberId} />
      )}

      <div className="flex flex-wrap items-center gap-2">
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

      <textarea
        ref={textRef}
        name="text"
        rows={3}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={
          targets.length === 1 ? `Сообщение в «${targets[0].label}»` : "Текст сообщения"
        }
        className={inputClass}
      />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Отправляю…" : "Отправить"}
        </button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-green-700">{state.ok}</span> : null}
      </div>
    </form>
  );
}

/** Проверка бота: отправить текст по chat_id / user_id. */
export function SendTestForm({
  botId,
  platform,
}: {
  botId: string;
  platform: "TELEGRAM" | "VK";
}) {
  const [state, formAction, pending] = useActionState(sendTestMessage, {} as SendState);

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <input type="hidden" name="botId" value={botId} />

      <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
        <input
          name="externalId"
          placeholder={platform === "TELEGRAM" ? "chat_id, например 123456789" : "user_id ВК"}
          className={inputClass}
        />
        <input name="text" defaultValue="Проверка связи" className={inputClass} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm hover:border-[var(--accent)] disabled:opacity-60"
        >
          {pending ? "Отправляю…" : "Отправить тест"}
        </button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-green-700">{state.ok}</span> : null}
        <span className="text-xs text-[var(--muted)]">
          {platform === "TELEGRAM"
            ? "Telegram разрешает писать только тем, кто уже писал боту"
            : "ВКонтакте разрешает писать тем, кто не запретил сообщения"}
        </span>
      </div>
    </form>
  );
}
