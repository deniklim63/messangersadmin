import Link from "next/link";
import { CreateScenarioForm } from "@/components/create-scenario-form";
import { toggleScenario } from "@/lib/actions-scenarios";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ScenariosPage() {
  const [scenarios, bots] = await Promise.all([
    prisma.scenario.findMany({
      orderBy: { createdAt: "desc" },
      include: { bot: true, _count: { select: { blocks: true } } },
    }),
    prisma.bot.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Сценарии</h1>
        <p className="text-sm text-[var(--muted)]">
          Экраны с текстом, картинкой и кнопками — бот ведёт по ним диалог сам
        </p>
      </header>

      <section className="rounded-2xl border border-[var(--line)] bg-white">
        <ul className="divide-y divide-[var(--line)]">
          {scenarios.map((scenario) => (
            <li key={scenario.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <Link
                  href={`/scenarios/${scenario.id}`}
                  className="font-medium hover:text-[var(--accent)]"
                >
                  {scenario.title}
                </Link>
                <div className="text-sm text-[var(--muted)]">
                  {scenario.bot.title} · экранов: {scenario._count.blocks}
                  {scenario.isActive ? " · включён" : ""}
                </div>
              </div>
              <form action={toggleScenario}>
                <input type="hidden" name="id" value={scenario.id} />
                <button
                  type="submit"
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    scenario.isActive
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-[var(--line)] hover:border-[var(--accent)]"
                  }`}
                >
                  {scenario.isActive ? "Выключить" : "Включить"}
                </button>
              </form>
            </li>
          ))}
          {scenarios.length === 0 ? (
            <li className="px-5 py-6 text-sm text-[var(--muted)]">Сценариев пока нет</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-sm font-semibold">Новый сценарий</h2>
        <div className="mt-4">
          {bots.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Сначала{" "}
              <Link href="/bots" className="text-[var(--accent)]">
                подключите бота
              </Link>
              .
            </p>
          ) : (
            <CreateScenarioForm bots={bots} />
          )}
        </div>
      </section>
    </div>
  );
}
