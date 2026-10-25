import { deliverBroadcast } from "@/lib/broadcast-delivery";
import { prisma } from "@/lib/db";
import { runFromBlock } from "@/lib/scenario";
import { processDueSchedules } from "@/lib/schedule-runs";

const TICK_MS = 5000;
const BATCH = 20;

let started = false;
let ticks = 0;

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

const OPERATOR_IDLE_HOURS = 24;

/**
 * Диалоги, переданные оператору, сами возвращаются боту, если сутки никто
 * ничего не писал — иначе человек навсегда остаётся «без бота».
 */
export async function releaseIdleOperatorDialogs(): Promise<number> {
  const threshold = new Date(Date.now() - OPERATOR_IDLE_HOURS * 3_600_000);
  const waiting = await prisma.subscriber.findMany({
    where: { needsOperator: true, operatorSince: { lt: threshold } },
    select: { id: true },
  });
  let released = 0;
  for (const { id } of waiting) {
    const recent = await prisma.message.findFirst({
      where: { subscriberId: id, createdAt: { gt: threshold } },
      select: { id: true },
    });
    if (recent) continue;
    await prisma.subscriber.update({
      where: { id },
      data: { needsOperator: false, operatorSince: null },
    });
    released += 1;
  }
  return released;
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
    void processDueSchedules().catch((error) => {
      console.error("Планировщик сценариев:", (error as Error).message);
    });
    // Раз в пять минут — чаще незачем.
    ticks += 1;
    if (ticks % 60 === 1) {
      void releaseIdleOperatorDialogs().catch((error) => {
        console.error("Возврат диалогов боту:", (error as Error).message);
      });
    }
  }, TICK_MS);
}
