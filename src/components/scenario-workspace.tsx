"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBlockAt, duplicateBlock, removeBlock } from "@/lib/actions-scenarios";
import { BlockEditor, type EditorBlock } from "@/components/block-editor";
import { ScenarioAssistant } from "@/components/scenario-assistant";
import { ScenarioCanvas, type CanvasBlock, type CanvasStats } from "@/components/scenario-canvas";
import { ScenarioSchedules, type ScheduleItem } from "@/components/scenario-schedules";

export type WorkspaceBlock = CanvasBlock & EditorBlock;

type Tab = "assistant" | "block" | "launch";

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
}: {
  scenarioId: string;
  blocks: WorkspaceBlock[];
  assistantEnabled: boolean;
  cities: { slug: string; name: string }[];
  schedules: ScheduleItem[];
  stats: CanvasStats;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(blocks.length <= 1 ? "assistant" : "block");
  const [busy, startTransition] = useTransition();
  const selected = blocks.find((block) => block.id === selectedId) ?? null;

  function select(id: string | null) {
    setSelectedId(id);
    if (id) setTab("block");
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

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "assistant", label: "✨ Помощник" },
    { id: "block", label: selected ? "✏️ Экран" : "🧩 Экраны", badge: blocks.length },
    { id: "launch", label: "⏰ Запуск", badge: schedules.filter((s) => s.isActive).length || undefined },
  ];

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <div className="min-w-0 flex-1">
        <ScenarioCanvas
          scenarioId={scenarioId}
          blocks={blocks}
          selectedId={selectedId}
          onSelect={select}
          onDuplicate={duplicate}
          stats={stats}
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
                <span
                  className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                    tab === item.id ? "bg-white/25" : "bg-[var(--bg)]"
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
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
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                          старт
                        </span>
                      ) : null}
                      <span className="shrink-0 text-xs text-[var(--muted)]">
                        {KIND_LABEL[block.kind] ?? block.kind}
                        {block.buttons.length ? ` · ${block.buttons.length} кн.` : ""}
                        {stats[block.id]?.sent ? ` · ✓ ${stats[block.id].sent}` : ""}
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
  );
}
