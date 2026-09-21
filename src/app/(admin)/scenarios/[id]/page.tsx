import Link from "next/link";
import { notFound } from "next/navigation";
import { ScenarioWorkspace } from "@/components/scenario-workspace";
import { deleteScenario, moveScenario, toggleScenario } from "@/lib/actions-scenarios";
import { prisma } from "@/lib/db";

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

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/scenarios" className="text-sm text-[var(--muted)] hover:underline">
            ← Ко всем сценариям
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{scenario.title}</h1>
          <p className="text-sm text-[var(--muted)]">
            {scenario.bot.title} · {scenario.isActive ? "включён" : "выключен"} · экранов:{" "}
            {scenario.blocks.length}
          </p>
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
              {scenario.isActive ? "Выключить" : "Включить"}
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
        blocks={scenario.blocks.map((block) => ({
          id: block.id,
          kind: block.kind,
          title: block.title,
          text: block.text,
          imageId: block.imageId,
          isStart: block.isStart,
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
