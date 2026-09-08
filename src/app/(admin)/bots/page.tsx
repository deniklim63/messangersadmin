import Link from "next/link";
import { CreateBotForm } from "@/components/create-bot-form";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function BotsPage() {
  const bots = await prisma.bot.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { subscribers: true } } },
  });

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Боты</h1>
        <p className="text-sm text-[var(--muted)]">
          Подключите Telegram-бота или сообщество ВКонтакте — данные пойдут в общую базу
        </p>
      </header>

      <section className="rounded-2xl border border-[var(--line)] bg-white">
        <ul className="divide-y divide-[var(--line)]">
          {bots.map((bot) => (
            <li key={bot.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <Link href={`/bots/${bot.id}`} className="font-medium hover:text-[var(--accent)]">
                  {bot.title}
                </Link>
                <div className="text-sm text-[var(--muted)]">
                  {bot.platform === "TELEGRAM" ? "Telegram" : "ВКонтакте"}
                  {bot.username ? ` · @${bot.username}` : ""}
                  {bot.isActive ? "" : " · выключен"}
                </div>
              </div>
              <Link
                href={`/contacts?bot=${bot.id}`}
                className="text-sm text-[var(--muted)] hover:text-[var(--accent)]"
              >
                {bot._count.subscribers} чел.
              </Link>
            </li>
          ))}
          {bots.length === 0 ? (
            <li className="px-5 py-6 text-sm text-[var(--muted)]">Пока ни одного бота</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-sm font-semibold">Новый бот</h2>
        <div className="mt-4">
          <CreateBotForm />
        </div>
      </section>
    </div>
  );
}
