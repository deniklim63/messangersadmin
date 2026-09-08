"use client";

import { useActionState } from "react";
import { login } from "@/lib/actions-auth";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, {} as { error?: string });

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Админка ботов</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          База пользователей Telegram и ВКонтакте
        </p>

        <label className="mt-6 block text-sm font-medium" htmlFor="password">
          Пароль
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />

        {state?.error ? (
          <p className="mt-3 text-sm text-red-600">{state.error}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-5 w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Проверяю…" : "Войти"}
        </button>
      </form>
    </main>
  );
}
