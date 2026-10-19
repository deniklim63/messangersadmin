"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeNextRun, runSchedule } from "@/lib/schedule-runs";

export type ScheduleState = { ok?: string; error?: string };

export async function createSchedule(
  _state: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  await requireAuth();
  const scenarioId = String(formData.get("scenarioId") ?? "");
  const blockId = String(formData.get("blockId") ?? "");
  const kind = String(formData.get("kind") ?? "once");
  const cities = formData.getAll("city").map(String).filter(Boolean);
  const runAtRaw = String(formData.get("runAt") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim() || null;
  const days = formData.getAll("day").map(Number).filter((day) => day >= 1 && day <= 7);

  const block = await prisma.scenarioBlock.findUnique({ where: { id: blockId } });
  if (!block || block.scenarioId !== scenarioId) return { error: "Выберите блок сценария" };

  let runAt: Date | null = null;
  if (kind === "once") {
    runAt = runAtRaw ? new Date(runAtRaw) : null;
    if (!runAt || Number.isNaN(runAt.getTime())) return { error: "Укажите дату и время" };
    if (runAt.getTime() < Date.now()) return { error: "Это время уже прошло" };
  } else {
    if (!days.length) return { error: "Отметьте хотя бы один день недели" };
    if (!time || !/^\d{2}:\d{2}$/.test(time)) return { error: "Укажите время" };
  }

  const draft = { kind, runAt, days, time };
  const nextRunAt = computeNextRun(draft);
  if (!nextRunAt) return { error: "Не получилось вычислить ближайший запуск" };

  await prisma.scenarioSchedule.create({
    data: { scenarioId, blockId, kind, runAt, days, time, cities, nextRunAt, isActive: true },
  });

  revalidatePath(`/scenarios/${scenarioId}`);
  return { ok: "Расписание добавлено" };
}

export async function toggleSchedule(formData: FormData): Promise<void> {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  const schedule = await prisma.scenarioSchedule.findUnique({ where: { id } });
  if (!schedule) return;
  const isActive = !schedule.isActive;
  await prisma.scenarioSchedule.update({
    where: { id },
    data: { isActive, nextRunAt: isActive ? computeNextRun(schedule) : schedule.nextRunAt },
  });
  revalidatePath(`/scenarios/${schedule.scenarioId}`);
}

export async function deleteSchedule(formData: FormData): Promise<void> {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  const schedule = await prisma.scenarioSchedule.delete({ where: { id } }).catch(() => null);
  if (schedule) revalidatePath(`/scenarios/${schedule.scenarioId}`);
}

/** Запустить прямо сейчас — проверить рассылку, не дожидаясь времени. */
export async function runScheduleNow(formData: FormData): Promise<void> {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  const schedule = await prisma.scenarioSchedule.findUnique({ where: { id } });
  if (!schedule) return;
  await runSchedule(id);
  revalidatePath(`/scenarios/${schedule.scenarioId}`);
}
