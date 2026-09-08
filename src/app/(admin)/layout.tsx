import { logout } from "@/lib/actions-auth";
import { requireAuth } from "@/lib/auth";
import { NavLink } from "@/components/nav-link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();

  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--line)] bg-white p-4">
        <div className="px-3 py-2">
          <div className="text-sm font-semibold">Админка ботов</div>
          <div className="text-xs text-[var(--muted)]">Telegram + ВКонтакте</div>
        </div>

        <nav className="mt-4 space-y-1">
          <NavLink href="/">Обзор</NavLink>
          <NavLink href="/contacts">Пользователи</NavLink>
          <NavLink href="/bots">Боты</NavLink>
        </nav>

        <form action={logout} className="mt-auto">
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--muted)] hover:bg-[var(--bg)]"
          >
            Выйти
          </button>
        </form>
      </aside>

      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
