import { prisma } from "@/lib/db";
import { recipientsWhere } from "@/lib/recipients";
import { runFromBlock } from "@/lib/scenario";

/** Москва без перехода на летнее время — UTC+3. */
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

type ScheduleShape = {
  kind: string;
  runAt: Date | null;
  days: number[];
  time: string | null;
};

/** Ближайший запуск после `after` по московскому времени. */
export function computeNextRun(schedule: ScheduleShape, after = new Date()): Date | null {
  if (schedule.kind === "once") {
    return schedule.runAt && schedule.runAt > after ? schedule.runAt : null;
  }
  if (!schedule.days.length || !schedule.time) return null;
  const [hours, minutes] = schedule.time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  // Считаем в «московских» координатах: сдвигаем UTC на +3 и работаем как с UTC.
  const local = new Date(after.getTime() + MSK_OFFSET_MS);
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + offset, hours, minutes),
    );
    const weekday = candidate.getUTCDay() === 0 ? 7 : candidate.getUTCDay();
    if (!schedule.days.includes(weekday)) continue;
    const utc = new Date(candidate.getTime() - MSK_OFFSET_MS);
    if (utc > after) return utc;
  }
  return null;
}

/** Запускает ветку сценария для всех подходящих подписчиков бота. */
export async function runSchedule(scheduleId: string): Promise<number> {
  const schedule = await prisma.scenarioSchedule.findUnique({
    where: { id: scheduleId },
    include: { scenario: true },
  });
  if (!schedule) return 0;

  const subscribers = await prisma.subscriber.findMany({
    where: recipientsWhere(schedule.scenario.botId, schedule.cities),
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  let count = 0;
  for (const subscriber of subscribers) {
    try {
      await runFromBlock(subscriber.id, schedule.blockId, { force: true });
      count += 1;
    } catch (error) {
      console.error("Запуск сценария по расписанию:", (error as Error).message);
    }
    // Держимся ниже лимитов платформ.
    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  await prisma.scenarioSchedule.update({
    where: { id: scheduleId },
    data: {
      lastRunAt: new Date(),
      lastCount: count,
      nextRunAt: computeNextRun(schedule),
      ...(schedule.kind === "once" ? { isActive: false } : {}),
    },
  });
  return count;
}

/** Запускает все расписания, у которых подошло время. */
export async function processDueSchedules(): Promise<number> {
  const due = await prisma.scenarioSchedule.findMany({
    where: { isActive: true, nextRunAt: { lte: new Date() } },
    select: { id: true, nextRunAt: true },
  });
  let started = 0;
  for (const item of due) {
    // Забираем атомарно: сдвигаем nextRunAt в будущее до того, как начнём слать.
    const claimed = await prisma.scenarioSchedule.updateMany({
      where: { id: item.id, nextRunAt: item.nextRunAt },
      data: { nextRunAt: new Date(Date.now() + 365 * 86_400_000) },
    });
    if (claimed.count === 0) continue;
    started += 1;
    await runSchedule(item.id);
  }
  return started;
}
