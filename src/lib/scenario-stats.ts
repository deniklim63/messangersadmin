import { prisma } from "@/lib/db";

export type BlockStats = {
  sent: number;
  errors: number;
  /** Уникальных нажатий по каждой кнопке. */
  clicks: Record<string, number>;
  lastError: string | null;
};

export type ScenarioTotals = { reached: number; clicked: number; errors: number };

/** Итоги по сценарию: сколько людей охвачено, сколько нажимали кнопки, сколько ошибок. */
export async function scenarioTotals(scenarioId: string): Promise<ScenarioTotals> {
  const blocks = await prisma.scenarioBlock.findMany({ where: { scenarioId }, select: { id: true } });
  const ids = blocks.map((block) => block.id);
  if (ids.length === 0) return { reached: 0, clicked: 0, errors: 0 };
  const [reached, clicked, errors] = await Promise.all([
    prisma.scenarioEvent.findMany({ where: { blockId: { in: ids }, kind: "sent" }, distinct: ["subscriberId"], select: { subscriberId: true } }),
    prisma.scenarioEvent.findMany({ where: { blockId: { in: ids }, kind: "click" }, distinct: ["subscriberId"], select: { subscriberId: true } }),
    prisma.scenarioEvent.findMany({ where: { blockId: { in: ids }, kind: "error" }, distinct: ["subscriberId"], select: { subscriberId: true } }),
  ]);
  return { reached: reached.length, clicked: clicked.length, errors: errors.length };
}

/** Сводка по экранам сценария: доставлено, ошибки, нажатия кнопок (уникальные люди). */
export async function scenarioStats(scenarioId: string): Promise<Record<string, BlockStats>> {
  const blocks = await prisma.scenarioBlock.findMany({
    where: { scenarioId },
    select: { id: true },
  });
  const ids = blocks.map((block) => block.id);
  if (ids.length === 0) return {};

  const rows = await prisma.scenarioEvent.groupBy({
    by: ["blockId", "buttonId", "kind", "subscriberId"],
    where: { blockId: { in: ids } },
  });
  const lastErrors = await prisma.scenarioEvent.findMany({
    where: { blockId: { in: ids }, kind: "error" },
    orderBy: { createdAt: "desc" },
    distinct: ["blockId"],
    select: { blockId: true, error: true },
  });

  const stats: Record<string, BlockStats> = {};
  for (const id of ids) stats[id] = { sent: 0, errors: 0, clicks: {}, lastError: null };
  for (const row of rows) {
    const stat = stats[row.blockId];
    if (!stat) continue;
    if (row.kind === "sent") stat.sent += 1;
    else if (row.kind === "error") stat.errors += 1;
    else if (row.kind === "click" && row.buttonId) {
      stat.clicks[row.buttonId] = (stat.clicks[row.buttonId] ?? 0) + 1;
    }
  }
  for (const item of lastErrors) {
    if (stats[item.blockId]) stats[item.blockId].lastError = item.error;
  }
  return stats;
}
