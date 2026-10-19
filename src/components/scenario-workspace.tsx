"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { duplicateBlock, removeBlock } from "@/lib/actions-scenarios";
import { BlockEditor, type EditorBlock } from "@/components/block-editor";
import { ScenarioAssistant } from "@/components/scenario-assistant";
import { ScenarioCanvas, type CanvasBlock } from "@/components/scenario-canvas";

export type WorkspaceBlock = CanvasBlock & EditorBlock;

export function ScenarioWorkspace({
  scenarioId,
  blocks,
  assistantEnabled,
}: {
  scenarioId: string;
  blocks: WorkspaceBlock[];
  assistantEnabled: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(blocks.length <= 1);
  const [busy, startTransition] = useTransition();
  const selected = blocks.find((block) => block.id === selectedId) ?? null;

  function duplicate(id: string) {
    startTransition(async () => {
      const copy = await duplicateBlock(id);
      if (copy) setSelectedId(copy.id);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await removeBlock(id);
      setSelectedId(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 xl:flex-row">
      <div className="min-w-0 flex-1">
        <ScenarioCanvas
          scenarioId={scenarioId}
          blocks={blocks}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onDuplicate={duplicate}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted)]">
            Перетаскивайте экраны мышью, тяните за кружок справа от кнопки, чтобы связать её
            с другим экраном. Колесо мыши — масштаб, перетаскивание фона — сдвиг схемы.
          </p>
          <button
            type="button"
            onClick={() => {
              setAssistantOpen((open) => !open);
              setSelectedId(null);
            }}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm ${
              assistantOpen
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--line)] hover:border-[var(--accent)]"
            }`}
          >
            ✨ AI-помощник
          </button>
        </div>
      </div>

      {assistantOpen && !selected ? (
        <ScenarioAssistant scenarioId={scenarioId} enabled={assistantEnabled} />
      ) : null}

      {selected ? (
        <aside className="w-full shrink-0 self-start rounded-2xl border border-[var(--line)] bg-white p-5 xl:w-[420px]">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="min-w-0 truncate text-sm font-semibold">Экран «{selected.title}»</h2>
            <div className="flex shrink-0 items-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => duplicate(selected.id)}
                disabled={busy}
                className="text-[var(--accent)] hover:underline disabled:opacity-60"
              >
                Дублировать
              </button>
              <button
                type="button"
                onClick={() => remove(selected.id)}
                disabled={busy || blocks.length === 1}
                className="text-red-600 hover:underline disabled:opacity-40"
              >
                Удалить
              </button>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-[var(--muted)] hover:underline"
              >
                Закрыть
              </button>
            </div>
          </div>

          <BlockEditor
            key={selected.id}
            block={selected}
            blocks={blocks.map((block) => ({ id: block.id, title: block.title }))}
          />
        </aside>
      ) : null}
    </div>
  );
}
