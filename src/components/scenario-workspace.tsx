"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBlockAt, duplicateBlock, removeBlock } from "@/lib/actions-scenarios";
import { AudienceDialog, type AudienceQuery } from "@/components/audience-dialog";
import { BlockEditor, type EditorBlock } from "@/components/block-editor";
import { ScenarioAssistant } from "@/components/scenario-assistant";
import { ScenarioCanvas, type CanvasBlock, type CanvasStats } from "@/components/scenario-canvas";
import { ScenarioSchedules, type ScheduleItem } from "@/components/scenario-schedules";

export type WorkspaceBlock = CanvasBlock & EditorBlock;

type Mode = "analytics" | "edit";
type Tab = "summary" | "assistant" | "block" | "launch";

const KIND_LABEL: Record<string, string> = {
  MESSAGE: "Сообщение",
  REQUEST: "Запрос",
  CODE: "Код",
  CONDITION: "Условие",
  DELAY: "Пауза",
  HANDOFF: "Оператор",
  INPUT: "Вопрос",
};

export function ScenarioWorkspace({
  scenarioId,
  blocks,
  assistantEnabled,
  cities,
  schedules,
  stats,
  totals,
}: {
  scenarioId: string;
  blocks: WorkspaceBlock[];
  assistantEnabled: boolean;
  cities: { slug: string; name: string }[];
  schedules: ScheduleItem[];
  stats: CanvasStats;
  totals: { reached: number; clicked: number; errors: number };
}) {
  const router = useRouter();
  // Пустой сценарий сразу открываем в редакторе — смотреть там пока нечего.
  const [mode, setMode] = useState<Mode>(blocks.length <= 1 ? "edit" : "analytics");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(blocks.length <= 1 ? "assistant" : "summary");
  const [audience, setAudience] = useState<AudienceQuery | null>(null);
  const [busy, startTransition] = useTransition();
  const selected = blocks.find((block) => block.id === selectedId) ?? null;

  function switchMode(next: Mode) {
    setMode(next);
    setSelectedId(null);
    setTab(next === "edit" ? "block" : "summary");
  }

  function select(id: string | null) {
    if (mode === "analytics") {
      // В аналитике клик по экрану показывает, кто его получил.
      if (id) openStat(id, null, "sent");
      return;
    }
    setSelectedId(id);
    if (id) setTab("block");
  }

  function openStat(blockId: string, buttonId: string | null, kind: "sent" | "error" | "click") {
    const block = blocks.find((item) => item.id === blockId);
    if (!block) return;
    const button = buttonId ? block.buttons.find((item) => item.id === buttonId) : null;
    setAudience({
      blockId,
      buttonId,
      kind,
      title: button ? `${block.title} → «${button.label}»` : block.title,
    });
  }

  function duplicate(id: string) {
    startTransition(async () => {
      const copy = await duplicateBlock(id);
      if (copy) select(copy.id);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Удалить этот экран? Связи на него пропадут.")) return;
    startTransition(async () => {
      await removeBlock(id);
      setSelectedId(null);
      router.refresh();
    });
  }

  function addBlock() {
    startTransition(async () => {
      const last = blocks[blocks.length - 1];
      const created = await createBlockAt(scenarioId, (last?.x ?? 0) + 320, last?.y ?? 40);
      select(created.id);
      router.refresh();
    });
  }

  const tabs: { id: Tab; label: string; badge?: number }[] =
    mode === "analytics"
      ? [
          { id: "summary", label: "📊 Сводка" },
          { id: "launch", label: "⏰ Запуск", badge: schedules.filter((s) => s.isActive).length || undefined },
        ]
      : [
          { id: "assistant", label: "✨ Помощник" },
          { id: "block", label: selected ? "✏️ Экран" : "🧩 Экраны", badge: blocks.length },
          { id: "launch", label: "⏰ Запуск", badge: schedules.filter((s) => s.isActive).length || undefined },
        ];

  const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-[var(--line)] bg-white p-1">
          {(
            [
              { id: "analytics", label: "📊 Аналитика" },
              { id: "edit", label: "✏️ Редактировать" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => switchMode(item.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                mode === item.id ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--muted)] hover:bg-[var(--bg)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {mode === "analytics" ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {[
              { label: "Охват", value: totals.reached, hint: "Людей, получивших хотя бы один экран" },
              { label: "Нажимали кнопки", value: totals.clicked, hint: "Людей, нажавших хотя бы одну кнопку", extra: pct(totals.clicked, totals.reached) },
              { label: "Ошибки доставки", value: totals.errors, hint: "Людей, которым не удалось доставить", danger: totals.errors > 0 },
            ].map((item) => (
              <div
                key={item.label}
                title={item.hint}
                className={`rounded-xl border px-3 py-1.5 ${
                  item.danger ? "border-red-200 bg-red-50 text-red-700" : "border-[var(--line)] bg-white"
                }`}
              >
                <span className="text-xs text-[var(--muted)]">{item.label} </span>
                <b className="tabular-nums">{item.value}</b>
                {item.extra ? <span className="ml-1 text-xs text-[var(--muted)]">{item.extra}</span> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-[var(--muted)]">Изменения сохраняются сразу</div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="min-w-0 flex-1">
          <ScenarioCanvas
            scenarioId={scenarioId}
            blocks={blocks}
            selectedId={selectedId}
            onSelect={select}
            onDuplicate={duplicate}
            stats={stats}
            readOnly={mode === "analytics"}
            onStat={openStat}
          />
        </div>

        <aside className="flex w-[440px] shrink-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
          <div className="flex shrink-0 border-b border-[var(--line)] p-1.5">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  tab === item.id
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--fg)]"
                }`}
              >
                {item.label}
                {item.badge ? (
                  <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${tab === item.id ? "bg-white/25" : "bg-[var(--bg)]"}`}>
                    {item.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            {tab === "summary" ? (
              <div className="p-4">
                <p className="mb-3 text-xs text-[var(--muted)]">
                  Нажмите на любую цифру — откроется список людей: имя, ник, e-mail, телефон, ID.
                  Чтобы менять сценарий, переключитесь в «Редактировать».
                </p>
                <ul className="space-y-2">
                  {blocks.map((block) => {
                    const stat = stats[block.id];
                    return (
                      <li key={block.id} className="rounded-xl border border-[var(--line)] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium">{block.title}</span>
                          <span className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openStat(block.id, null, "sent")}
                              className="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs tabular-nums text-emerald-700 hover:ring-2 hover:ring-emerald-200"
                              title="Получили"
                            >
                              ✓ {stat?.sent ?? 0}
                            </button>
                            {stat?.errors ? (
                              <button
                                type="button"
                                onClick={() => openStat(block.id, null, "error")}
                                className="rounded-lg bg-red-50 px-2 py-0.5 text-xs tabular-nums text-red-700 hover:ring-2 hover:ring-red-200"
                                title="Не доставлено"
                              >
                                ⚠ {stat.errors}
                              </button>
                            ) : null}
                          </span>
                        </div>
                        {block.buttons.length ? (
                          <ul className="mt-2 space-y-1">
                            {block.buttons.map((button) => {
                              const clicks = stat?.clicks[button.id] ?? 0;
                              const share = stat?.sent ? clicks / stat.sent : 0;
                              return (
                                <li key={button.id}>
                                  <button
                                    type="button"
                                    onClick={() => openStat(block.id, button.id, "click")}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-[var(--bg)]"
                                    title="Кто нажал"
                                  >
                                    <span className="min-w-0 flex-1 truncate">{button.label}</span>
                                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--bg)]">
                                      <span
                                        className="block h-full rounded-full bg-[var(--accent)]"
                                        style={{ width: `${Math.round(share * 100)}%` }}
                                      />
                                    </span>
                                    <span className="w-16 shrink-0 text-right tabular-nums text-[var(--muted)]">
                                      {clicks} · {Math.round(share * 100)}%
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {tab === "assistant" ? (
              <ScenarioAssistant scenarioId={scenarioId} enabled={assistantEnabled} />
            ) : null}

            {tab === "block" && selected ? (
              <div className="p-4">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm hover:border-[var(--accent)]"
                    title="К списку экранов"
                  >
                    ← Все экраны
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => duplicate(selected.id)}
                      disabled={busy}
                      className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm hover:border-[var(--accent)] disabled:opacity-60"
                    >
                      ⧉ Дублировать
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(selected.id)}
                      disabled={busy || blocks.length === 1}
                      className="rounded-lg border border-red-200 px-2.5 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
                <BlockEditor
                  key={selected.id}
                  block={selected}
                  blocks={blocks.map((block) => ({ id: block.id, title: block.title }))}
                />
              </div>
            ) : null}

            {tab === "block" && !selected ? (
              <div className="p-4">
                <button
                  type="button"
                  onClick={addBlock}
                  disabled={busy}
                  className="mb-3 w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60"
                >
                  + Новый экран
                </button>
                <p className="mb-2 text-xs text-[var(--muted)]">
                  Нажмите на экран здесь или на схеме, чтобы изменить текст и кнопки.
                </p>
                <ul className="space-y-1">
                  {blocks.map((block) => (
                    <li key={block.id}>
                      <button
                        type="button"
                        onClick={() => select(block.id)}
                        className="flex w-full items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-left text-sm hover:border-[var(--accent)] hover:bg-[var(--bg)]"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">{block.title}</span>
                        {block.isStart ? (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">старт</span>
                        ) : null}
                        <span className="shrink-0 text-xs text-[var(--muted)]">
                          {KIND_LABEL[block.kind] ?? block.kind}
                          {block.buttons.length ? ` · ${block.buttons.length} кн.` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {tab === "launch" ? (
              <ScenarioSchedules
                scenarioId={scenarioId}
                blocks={blocks.map((block) => ({ id: block.id, title: block.title, isStart: block.isStart }))}
                cities={cities}
                schedules={schedules}
              />
            ) : null}
          </div>
        </aside>
      </div>

      {audience ? <AudienceDialog query={audience} onClose={() => setAudience(null)} /> : null}
    </div>
  );
}
