import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
      <div className="text-sm text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardPage() {
  const [total, bots, cities, withPhone, withEmail, multiBot, recent] = await Promise.all([
    prisma.contact.count(),
    prisma.bot.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { subscribers: true } } },
    }),
    prisma.city.findMany({
      include: { _count: { select: { contacts: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.contact.count({ where: { phone: { not: null } } }),
    prisma.contact.count({ where: { email: { not: null } } }),
    prisma.contact.findMany({ select: { _count: { select: { subscribers: true } } } }),
    prisma.contact.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { city: true, subscribers: { include: { bot: true } } },
    }),
  ]);

  const inTwoOrMore = multiBot.filter((c) => c._count.subscribers > 1).length;
  const topCities = [...cities].sort((a, b) => b._count.contacts - a._count.contacts).slice(0, 6);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Обзор</h1>
        <p className="text-sm text-[var(--muted)]">Что уже собрано ботами</p>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Всего пользователей" value={total} href="/contacts" />
        <Stat label="С телефоном" value={withPhone} />
        <Stat label="С e-mail" value={withEmail} />
        <Stat label="Есть в 2+ ботах" value={inTwoOrMore} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
          <h2 className="text-sm font-semibold">Боты</h2>
          {bots.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              Пока ни одного бота.{" "}
              <Link href="/bots" className="text-[var(--accent)]">
                Подключить
              </Link>
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {bots.map((bot) => (
                <li key={bot.id}>
                  <Link
                    href={`/bots/${bot.id}`}
                    className="-mx-2 flex items-center justify-between rounded-lg px-2 py-1 text-sm hover:bg-[var(--bg)]"
                  >
                    <span>
                      {bot.platform === "TELEGRAM" ? "TG" : "ВК"} · {bot.title}
                    </span>
                    <span className="tabular-nums text-[var(--muted)]">
                      {bot._count.subscribers}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
          <h2 className="text-sm font-semibold">Города</h2>
          {topCities.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">Города появятся после анкет.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {topCities.map((city) => (
                <li key={city.id} className="flex items-center justify-between text-sm">
                  <Link
                    href={`/contacts?city=${city.slug}`}
                    className="hover:text-[var(--accent)]"
                  >
                    {city.name}
                  </Link>
                  <span className="tabular-nums text-[var(--muted)]">
                    {city._count.contacts}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-sm font-semibold">Последние пользователи</h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Пока пусто — данные появятся, как только бот получит первое сообщение.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--line)]">
            {recent.map((contact) => (
              <li key={contact.id}>
                <Link
                  href={`/contacts/${contact.id}`}
                  className="-mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-2 text-sm hover:bg-[var(--bg)]"
                >
                  <span>{contact.name ?? contact.phone ?? contact.email ?? "Без имени"}</span>
                  <span className="text-[var(--muted)]">
                    {contact.city?.name ?? "—"} ·{" "}
                    {contact.subscribers.map((s) => s.bot.title).join(", ") || "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
