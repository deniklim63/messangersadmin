import Link from "next/link";
import { ImportForm } from "@/components/import-form";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const bots = await prisma.bot.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <Link href="/contacts" className="text-sm text-[var(--muted)] hover:underline">
          ← Ко всем пользователям
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Импорт пользователей</h1>
        <p className="text-sm text-[var(--muted)]">
          Выгрузка из salebot, Senler, BotHelp или любой другой CSV-файл
        </p>
      </header>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        {bots.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Сначала{" "}
            <Link href="/bots" className="text-[var(--accent)]">
              подключите бота
            </Link>
            : импортированных людей нужно к кому-то привязать.
          </p>
        ) : (
          <ImportForm bots={bots} />
        )}
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Как выгрузить из salebot</h2>
        <p className="mt-2">
          Раздел «Клиенты» → выгрузка в CSV. В файле нужна колонка с уникальным идентификатором
          в мессенджере — для ВКонтакте это числовой id пользователя. Без него человек попадёт
          в базу, но написать ему будет нельзя.
        </p>
        <p className="mt-2">
          Телефон и e-mail из файла склеиваются с теми, кто уже есть в базе: один человек не
          задвоится, даже если писал и в Telegram, и во ВКонтакте. Данные из файла не затирают
          то, что человек сообщил боту позже.
        </p>
      </section>
    </div>
  );
}
