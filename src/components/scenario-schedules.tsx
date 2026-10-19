"use client";

import { useActionState, useState } from "react";
import {
  createSchedule,
  deleteSchedule,
  runScheduleNow,
  toggleSchedule,
  type ScheduleState,
} from "@/lib/actions-schedules";

const controlClass =
  "rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export type ScheduleItem = {
  id: string;
  blockTitle: string;
  kind: string;
  runAt: string | null;
  days: number[];
  time: string | null;
  cities: string[];
  isActive: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastCount: number;
};

function moscow(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ScenarioSchedules({
  scenarioId,
  blocks,
  cities,
  schedules,
}: {
  scenarioId: string;
  blocks: { id: string; title: string; isStart: boolean }[];
  cities: { slug: string; name: string }[];
  schedules: ScheduleItem[];
}) {
  const [state, action, pending] = useActionState(createSchedule, {} as ScheduleState);
  const [kind, setKind] = useState<"once" | "weekly">("once");
  const [runAtLocal, setRunAtLocal] = useState("");
  const start = blocks.find((block) => block.isStart) ?? blocks[0];

  return (
    <section className="p-4">
      <h2 className="text-sm font-semibold">Запуск по расписанию</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        В назначенное время бот сам отправит выбранный экран подписчикам, дальше человек идёт
        по сценарию кнопками. Время — московское.
      </p>

      {schedules.length ? (
        <ul className="mt-4 divide-y divide-[var(--line)]">
          {schedules.map((item) => (
            <li key={item.id} className="space-y-2 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">
                  {item.kind === "once"
                    ? `Один раз · ${moscow(item.runAt)}`
                    : `Каждую неделю · ${item.days.map((d) => DAY_LABELS[d - 1]).join(", ")} в ${item.time}`}
                  {" · "}блок «{item.blockTitle}»
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {item.isActive
                    ? `Следующий запуск: ${moscow(item.nextRunAt)}`
                    : "Выключено"}
                  {item.lastRunAt
                    ? ` · последний: ${moscow(item.lastRunAt)}, получили ${item.lastCount}`
                    : ""}
                  {item.cities.length ? ` · города: ${item.cities.length}` : " · все города"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
              <form action={toggleSchedule}>
                <input type="hidden" name="id" value={item.id} />
                <button
                  type="submit"
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    item.isActive
                      ? "border-green-300 bg-green-50 text-green-700"
                      : "border-[var(--line)] text-[var(--muted)]"
                  }`}
                >
                  {item.isActive ? "● Включено" : "○ Выключено"}
                </button>
              </form>
              <form
                action={runScheduleNow}
                onSubmit={(event) => {
                  if (!confirm("Отправить этот блок всем получателям прямо сейчас?")) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="id" value={item.id} />
                <button type="submit" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm">
                  Запустить сейчас
                </button>
              </form>
              <form action={deleteSchedule}>
                <input type="hidden" name="id" value={item.id} />
                <button type="submit" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-red-600">
                  Удалить
                </button>
              </form>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <h3 className="mt-5 text-sm font-semibold">Новый запуск</h3>
      <form action={action} className="mt-2 grid gap-3">
        <input type="hidden" name="scenarioId" value={scenarioId} />
        <label className="block text-sm font-medium">
          Какой блок отправить
          <select name="blockId" defaultValue={start?.id} className={`mt-1 w-full ${controlClass}`}>
            {blocks.map((block) => (
              <option key={block.id} value={block.id}>
                {block.title}
                {block.isStart ? " (старт)" : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="text-sm font-medium">
          Когда
          <div className="mt-1 flex gap-2">
            {(["once", "weekly"] as const).map((option) => (
              <label
                key={option}
                className={`cursor-pointer rounded-lg border px-3 py-2 font-normal ${
                  kind === option ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)]"
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={option}
                  checked={kind === option}
                  onChange={() => setKind(option)}
                  className="sr-only"
                />
                {option === "once" ? "Один раз" : "По дням недели"}
              </label>
            ))}
          </div>
        </div>

        {kind === "once" ? (
          <label className="block text-sm font-medium">
            Дата и время
            <input
              type="datetime-local"
              value={runAtLocal}
              onChange={(event) => setRunAtLocal(event.target.value)}
              className={`mt-1 w-full ${controlClass}`}
            />
            <input
              type="hidden"
              name="runAt"
              value={runAtLocal ? new Date(runAtLocal).toISOString() : ""}
            />
          </label>
        ) : (
          <>
            <div className="text-sm font-medium">
              Дни
              <div className="mt-1 flex flex-wrap gap-1">
                {DAY_LABELS.map((label, index) => (
                  <label key={label} className="cursor-pointer rounded-lg border border-[var(--line)] px-2 py-1.5 font-normal has-[:checked]:border-[var(--accent)] has-[:checked]:text-[var(--accent)]">
                    <input type="checkbox" name="day" value={index + 1} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <label className="block text-sm font-medium">
              Время (Москва)
              <input type="time" name="time" defaultValue="12:00" className={`mt-1 w-full ${controlClass}`} />
            </label>
          </>
        )}

        <div className="text-sm font-medium">
          Города <span className="font-normal text-[var(--muted)]">(ничего не отмечено — всем)</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {cities.map((city) => (
              <label key={city.slug} className="cursor-pointer rounded-lg border border-[var(--line)] px-2 py-1.5 font-normal has-[:checked]:border-[var(--accent)] has-[:checked]:text-[var(--accent)]">
                <input type="checkbox" name="city" value={city.slug} className="sr-only" />
                {city.name}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || blocks.length === 0}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Добавить расписание
          </button>
          {state.ok ? <span className="text-sm text-green-700">{state.ok}</span> : null}
          {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        </div>
      </form>
    </section>
  );
}
