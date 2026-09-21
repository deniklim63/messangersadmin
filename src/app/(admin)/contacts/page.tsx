import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  buildWhere,
  filtersToQuery,
  multiBotContactIds,
  parseFilters,
} from "@/lib/contact-filters";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function BotBadge({ title, platform }: { title: string; platform: "TELEGRAM" | "VK" }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-xs ${
        platform === "TELEGRAM"
          ? "bg-sky-50 text-sky-700"
          : "bg-indigo-50 text-indigo-700"
      }`}
    >
      {platform === "TELEGRAM" ? "TG" : "ВК"} {title}
    </span>
  );
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const page = Math.max(1, Number(Array.isArray(params.page) ? params.page[0] : params.page) || 1);

  const where = buildWhere(filters);
  if (filters.multi === "1") {
    const ids = await multiBotContactIds(prisma);
    Object.assign(where, { AND: [...((where.AND as object[]) ?? []), { id: { in: ids } }] });
  }

  const [cities, bots, total, contacts] = await Promise.all([
    prisma.city.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { contacts: true } } },
    }),
    prisma.bot.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { city: true, subscribers: { include: { bot: true } } },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inputClass =
    "rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Пользователи</h1>
          <p className="text-sm text-[var(--muted)]">Найдено: {total}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/contacts/import"
            className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-sm hover:border-[var(--accent)]"
          >
            Импорт CSV
          </Link>
          <Link
            href={`/api/contacts/export${filtersToQuery(filters)}`}
            className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-sm hover:border-[var(--accent)]"
          >
            Выгрузить CSV
          </Link>
        </div>
      </header>

      <form className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--line)] bg-white p-4">
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Имя, телефон, e-mail, @username"
          className={`${inputClass} min-w-64 flex-1`}
        />

        <select name="city" defaultValue={filters.city ?? ""} className={inputClass}>
          <option value="">Все города</option>
          {cities.map((city) => (
            <option key={city.id} value={city.slug}>
              {city.name} ({city._count.contacts})
            </option>
          ))}
          <option value="none">Город не указан</option>
        </select>

        <select name="bot" defaultValue={filters.bot ?? ""} className={inputClass}>
          <option value="">Все боты</option>
          {bots.map((bot) => (
            <option key={bot.id} value={bot.id}>
              {bot.platform === "TELEGRAM" ? "TG" : "ВК"} · {bot.title}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 px-1 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            name="multi"
            value="1"
            defaultChecked={filters.multi === "1"}
          />
          Есть в 2+ ботах
        </label>

        <button
          type="submit"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
        >
          Показать
        </button>
        <Link href="/contacts" className="px-2 text-sm text-[var(--muted)] hover:underline">
          Сбросить
        </Link>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--line)] text-left text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Имя</th>
              <th className="px-4 py-3 font-medium">Телефон</th>
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Город</th>
              <th className="px-4 py-3 font-medium">Боты</th>
              <th className="px-4 py-3 font-medium">Добавлен</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {contacts.map((contact) => (
              <tr key={contact.id} className="hover:bg-[var(--bg)]">
                <td className="p-0">
                  <Link
                    href={`/contacts/${contact.id}`}
                    className="block px-4 py-3 font-medium hover:text-[var(--accent)]"
                  >
                    {contact.name ?? "Без имени"}
                  </Link>
                </td>
                <td className="px-4 py-3 tabular-nums">{contact.phone ?? "—"}</td>
                <td className="px-4 py-3">{contact.email ?? "—"}</td>
                <td className="px-4 py-3">{contact.city?.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {contact.subscribers.map((sub) => (
                      <BotBadge key={sub.id} title={sub.bot.title} platform={sub.bot.platform} />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {contact.createdAt.toLocaleDateString("ru-RU")}
                </td>
              </tr>
            ))}
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[var(--muted)]">
                  Никого не нашлось
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <nav className="flex items-center gap-2 text-sm">
          {Array.from({ length: pages }, (_, index) => index + 1).map((number) => {
            const query = new URLSearchParams(
              Object.entries(filters).filter(([, value]) => Boolean(value)) as [string, string][],
            );
            query.set("page", String(number));
            return (
              <Link
                key={number}
                href={`/contacts?${query}`}
                className={`rounded-lg border px-3 py-1.5 ${
                  number === page
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-[var(--line)] bg-white"
                }`}
              >
                {number}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
