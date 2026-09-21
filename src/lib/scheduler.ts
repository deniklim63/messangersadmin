import { prisma } from "@/lib/db";
import { runFromBlock } from "@/lib/scenario";

const TICK_MS = 5000;
const BATCH = 20;

let started = false;

/** Выполняет отложенные шаги, у которых подошло время. */
export async function processDueSteps(): Promise<number> {
  const due = await prisma.scheduledStep.findMany({
    where: { runAt: { lte: new Date() } },
    take: BATCH,
    orderBy: { runAt: "asc" },
  });

  for (const step of due) {
    // Сначала убираем запись, чтобы шаг не повторился при ошибке отправки.
    await prisma.scheduledStep.delete({ where: { id: step.id } }).catch(() => null);
    try {
      await runFromBlock(step.subscriberId, step.blockId);
    } catch (error) {
      console.error("Отложенный шаг не выполнился:", (error as Error).message);
    }
  }

  return due.length;
}

/** Запускает фоновый цикл один раз на процесс. */
export function startScheduler(): void {
  if (started) return;
  started = true;

  setInterval(() => {
    void processDueSteps().catch((error) => {
      console.error("Планировщик:", (error as Error).message);
    });
  }, TICK_MS);
}
