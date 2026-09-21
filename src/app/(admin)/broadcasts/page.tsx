import Link from "next/link";
import { BroadcastForm } from "@/components/broadcast-form";
import { recipientsWhere } from "@/lib/recipients";
import { prisma } from "@/lib/db";
import { toPlainText } from "@/lib/message-format";

export const dynamic = "force-dynamic";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };
  const many = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value : value ? [value] : [];
  };

  const [bots, cities, noCityCount] = await Promise.all([
    prisma.bot.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
    prisma.city.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { contacts: true } } },
    }),
    prisma.contact.count({ where: { cityId: null } }),
  ]);

  const botId = single("bot") || bots[0]?.id || "";
  const selectedCities = many("city");

  const [recipients, recent] = await Promise.all([
    botId ? prisma.subscriber.count({ where: recipientsWhere(botId, selectedCities) }) : 0,
    prisma.broadcast.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { bot: true },
    }),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Рассылки</h1>
        <p className="text-sm text-[var(--muted)]">
          Новостное сообщение пользователям выбранного бота
        </p>
      </header>

      {bots.length === 0 ? (
        <section className="rounded-2xl border border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">
          Сначала{" "}
          <Link href="/bots" className="text-[var(--accent)]">
            подключите бота
          </Link>
          .
        </section>
      ) : (
        <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
          <BroadcastForm
            bots={bots.map((bot) => ({
              id: bot.id,
              title: bot.title,
              platform: bot.platform,
              hasToken: Boolean(bot.token),
            }))}
            cities={[
              ...cities.map((item) => ({
                slug: item.slug,
                name: item.name,
                count: item._count.contacts,
              })),
              ...(noCityCount > 0
                ? [{ slug: "none", name: "Город не указан", count: noCityCount }]
                : []),
            ]}
            botId={botId}
            selectedCities={selectedCities}
            recipients={recipients}
          />
          <p className="mt-4 text-xs text-[var(--muted)]">
            Пишем только тем, кто уже общался с ботом и не заблокировал его. Отправка идёт
            по одному сообщению с паузой, чтобы не упереться в лимиты платформы — на большой
            базе это займёт время, страницу закрывать не стоит. Файл загружается один раз:
            дальше Telegram рассылает его по внутренней ссылке.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-sm font-semibold">Последние отправленные</h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">Пока ничего не отправляли.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--line)]">
            {recent.map((broadcast) => (
              <li key={broadcast.id}>
                <Link
                  href={`/broadcasts/${broadcast.id}`}
                  className="-mx-2 block rounded-lg px-2 py-3 hover:bg-[var(--bg)]"
                >
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium">
                      {broadcast.mediaKind === "photo"
                        ? "🖼 "
                        : broadcast.mediaKind === "video"
                          ? "🎬 "
                          : ""}
                      {toPlainText(broadcast.text).slice(0, 70) || "Без текста"}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--muted)]">
                      {broadcast.createdAt.toLocaleString("ru-RU")}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--muted)]">
                    {broadcast.bot.title} · отправлено {broadcast.sent} из {broadcast.recipients}
                    {broadcast.failed > 0 ? ` · не дошло ${broadcast.failed}` : ""}
                    {broadcast.cities.length
                      ? ` · города: ${broadcast.cities.length}`
                      : " · все города"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
