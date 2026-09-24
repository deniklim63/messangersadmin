import { deliverBroadcast } from "@/lib/broadcast-delivery";
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

/** Отправляет рассылки, у которых подошло назначенное время. */
export async function processDueBroadcasts(): Promise<number> {
  const due = await prisma.broadcast.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
  });

  let started = 0;
  for (const { id } of due) {
    // Забираем рассылку атомарно: если вдруг два процесса — уйдёт только один раз.
    const claimed = await prisma.broadcast.updateMany({
      where: { id, status: "SCHEDULED" },
      data: { status: "SENDING" },
    });
    if (claimed.count === 0) continue;
    started += 1;
    try {
      await deliverBroadcast(id);
    } catch (error) {
      console.error("Отложенная рассылка не ушла:", (error as Error).message);
      await prisma.broadcast
        .update({
          where: { id },
          data: {
            status: "DONE",
            sentAt: new Date(),
            failures: [{ name: "—", reason: (error as Error).message }],
          },
        })
        .catch(() => null);
    }
  }
  return started;
}

/** Запускает фоновый цикл один раз на процесс. */
export function startScheduler(): void {
  if (started) return;
  started = true;

  setInterval(() => {
    void processDueSteps().catch((error) => {
      console.error("Планировщик:", (error as Error).message);
    });
    void processDueBroadcasts().catch((error) => {
      console.error("Планировщик рассылок:", (error as Error).message);
    });
  }, TICK_MS);
}
