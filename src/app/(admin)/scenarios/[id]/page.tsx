import Link from "next/link";
import { notFound } from "next/navigation";
import { ScenarioWorkspace } from "@/components/scenario-workspace";
import { deleteScenario, moveScenario, toggleScenario } from "@/lib/actions-scenarios";
import { prisma } from "@/lib/db";
import { getSetting, SETTING_ANTHROPIC_KEY, SETTING_GEMINI_KEY } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const bots = await prisma.bot.findMany({ orderBy: { createdAt: "asc" } });
  const scenario = await prisma.scenario.findUnique({
    where: { id },
    include: {
      bot: true,
      blocks: {
        orderBy: [{ isStart: "desc" }, { createdAt: "asc" }],
        include: { buttons: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!scenario) notFound();

  const [assistantKey, geminiKey, cities, schedules] = await Promise.all([
    getSetting(SETTING_ANTHROPIC_KEY),
    getSetting(SETTING_GEMINI_KEY),
    prisma.city.findMany({ orderBy: { name: "asc" } }),
    prisma.scenarioSchedule.findMany({
      where: { scenarioId: id },
      orderBy: { createdAt: "asc" },
      include: { block: { select: { title: true } } },
    }),
  ]);

  return (
    <div className="-m-8 flex h-dvh flex-col gap-3 p-4">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/scenarios"
            className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm hover:border-[var(--accent)]"
          >
            ← Сценарии
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight">{scenario.title}</h1>
            <p className="text-xs text-[var(--muted)]">
              {scenario.bot.platform === "TELEGRAM" ? "Telegram" : "ВКонтакте"} · {scenario.bot.title} ·{" "}
              {scenario.isActive ? "основной сценарий бота" : "не основной"} · экранов:{" "}
              {scenario.blocks.length}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action={moveScenario} className="flex items-center gap-2">
            <input type="hidden" name="id" value={scenario.id} />
            <select
              name="botId"
              defaultValue={scenario.botId}
              className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
            >
              {bots.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.platform === "TELEGRAM" ? "Telegram" : "ВКонтакте"} · {bot.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:border-[var(--accent)]"
            >
              Перенести
            </button>
          </form>

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
              {scenario.isActive ? "Основной ✓" : "Сделать основным"}
            </button>
          </form>
          <form action={deleteScenario}>
            <input type="hidden" name="id" value={scenario.id} />
            <button
              type="submit"
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-red-600 hover:border-red-300"
            >
              Удалить
            </button>
          </form>
        </div>
      </header>

      <ScenarioWorkspace
        scenarioId={scenario.id}
        assistantEnabled={Boolean(assistantKey || geminiKey)}
        cities={cities.map((city) => ({ slug: city.slug, name: city.name }))}
        schedules={schedules.map((item) => ({
          id: item.id,
          blockTitle: item.block.title,
          kind: item.kind,
          runAt: item.runAt?.toISOString() ?? null,
          days: item.days,
          time: item.time,
          cities: item.cities,
          isActive: item.isActive,
          nextRunAt: item.nextRunAt?.toISOString() ?? null,
          lastRunAt: item.lastRunAt?.toISOString() ?? null,
          lastCount: item.lastCount,
        }))}
        blocks={scenario.blocks.map((block) => ({
          id: block.id,
          kind: block.kind,
          title: block.title,
          text: block.text,
          imageId: block.imageId,
          isStart: block.isStart,
          buttonsInline: block.buttonsInline,
          keywords: block.keywords,
          method: block.method,
          url: block.url,
          headers: (block.headers as Record<string, string> | null) ?? null,
          body: block.body,
          saveAs: block.saveAs,
          code: block.code,
          conditions: block.conditions,
          inputKind: block.inputKind,
          inputError: block.inputError,
          conditionCount: Array.isArray(block.conditions) ? block.conditions.length : 0,
          delaySeconds: block.delaySeconds,
          listSource: block.listSource,
          listTemplate: block.listTemplate,
          listEmpty: block.listEmpty,
          listLimit: block.listLimit,
          nextBlockId: block.nextBlockId,
          nextWaypoint:
            block.nextWaypointX !== null && block.nextWaypointY !== null
              ? { x: block.nextWaypointX, y: block.nextWaypointY }
              : null,
          x: block.positionX,
          y: block.positionY,
          buttons: block.buttons.map((button) => ({
            id: button.id,
            label: button.label,
            targetBlockId: button.targetBlockId,
            url: button.url,
            waypoint:
              button.waypointX !== null && button.waypointY !== null
                ? { x: button.waypointX, y: button.waypointY }
                : null,
          })),
        }))}
      />
    </div>
  );
}
