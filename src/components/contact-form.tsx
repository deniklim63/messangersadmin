"use client";

import { useActionState } from "react";
import { updateContact } from "@/lib/actions-contacts";

type Props = {
  contact: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    city: { name: string } | null;
  };
};

const inputClass =
  "mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

export function ContactForm({ contact }: Props) {
  const [state, formAction, pending] = useActionState(updateContact, {} as {
    error?: string;
    ok?: boolean;
  });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={contact.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Имя
          <input name="name" defaultValue={contact.name ?? ""} className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          Телефон
          <input
            name="phone"
            defaultValue={contact.phone ?? ""}
            placeholder="+7 999 123-45-67"
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-medium">
          E-mail
          <input name="email" defaultValue={contact.email ?? ""} className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          Город
          <input name="city" defaultValue={contact.city?.name ?? ""} className={inputClass} />
        </label>
      </div>

      <label className="block text-sm font-medium">
        Заметки
        <textarea
          name="notes"
          rows={3}
          defaultValue={contact.notes ?? ""}
          className={inputClass}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Сохраняю…" : "Сохранить"}
        </button>
        {state?.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        {state?.ok ? <span className="text-sm text-green-700">Сохранено</span> : null}
      </div>
    </form>
  );
}
