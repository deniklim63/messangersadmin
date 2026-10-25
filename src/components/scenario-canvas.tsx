"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearNextBlock,
  connectButton,
  createBlockAt,
  saveBlockPositions,
  saveLinkWaypoint,
} from "@/lib/actions-scenarios";
import {
  autoLayout,
  blockHeight,
  buttonPortOffset,
  connectorMidpoint,
  entryPoint,
  connectorPath,
  BLOCK_WIDTH,
  BUTTON_HEIGHT,
  HEADER_HEIGHT,
  TEXT_HEIGHT,
} from "@/lib/scenario-layout";

export type CanvasStats = Record<
  string,
  { sent: number; errors: number; clicks: Record<string, number>; lastError: string | null }
>;

export type CanvasBlock = {
  id: string;
  kind: "MESSAGE" | "REQUEST" | "CODE" | "CONDITION" | "DELAY" | "HANDOFF" | "INPUT";
  title: string;
  text: string;
  imageId: string | null;
  isStart: boolean;
  url: string | null;
  method: string | null;
  nextBlockId: string | null;
  nextWaypoint: { x: number; y: number } | null;
  saveAs: string | null;
  delaySeconds: number | null;
  conditionCount: number;
  x: number;
  y: number;
  buttons: {
    id: string;
    label: string;
    targetBlockId: string | null;
    url: string | null;
    waypoint: { x: number; y: number } | null;
  }[];
};

const KIND_BADGE: Record<CanvasBlock["kind"], { label: string; className: string }> = {
  MESSAGE: { label: "", className: "" },
  REQUEST: { label: "запрос", className: "bg-amber-50 text-amber-700" },
  CODE: { label: "код", className: "bg-violet-50 text-violet-700" },
  CONDITION: { label: "условие", className: "bg-emerald-50 text-emerald-700" },
  DELAY: { label: "пауза", className: "bg-sky-50 text-sky-700" },
  HANDOFF: { label: "оператор", className: "bg-rose-50 text-rose-700" },
  INPUT: { label: "вопрос", className: "bg-teal-50 text-teal-700" },
};

type Point = { x: number; y: number };

type DragState =
  | { kind: "block"; id: string; startPointer: Point; startPosition: Point }
  | { kind: "pan"; startPointer: Point; startView: Point }
  | { kind: "link"; buttonId: string; from: Point; to: Point }
  | { kind: "bend"; link: { kind: "button" | "next"; id: string }; at: Point };

export function ScenarioCanvas({
  scenarioId,
  blocks,
  selectedId,
  onSelect,
  onDuplicate,
  stats = {},
}: {
  scenarioId: string;
  blocks: CanvasBlock[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDuplicate: (id: string) => void;
  stats?: CanvasStats;
}) {
  const router = useRouter();
  const surfaceRef = useRef<HTMLDivElement>(null);

  const [positions, setPositions] = useState<Record<string, Point>>(() => {
    const stored = Object.fromEntries(blocks.map((block) => [block.id, { x: block.x, y: block.y }]));
    const untouched = blocks.every((block) => block.x === 0 && block.y === 0);
    return untouched && blocks.length > 1 ? autoLayout(blocks) : stored;
  });
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [moved, setMoved] = useState(false);
  // Выделенная связь: по клику на неё показываем корзину.
  const [selectedLink, setSelectedLink] = useState<
    { kind: "button" | "next"; id: string; at: Point } | null
  >(null);
  // Пока тащим изгиб, показываем его сразу, не дожидаясь сохранения.
  const [bends, setBends] = useState<Record<string, Point>>({});
  // Возвраты в стартовый экран сильно засоряют схему — по умолчанию прячем.
  const [showReturns, setShowReturns] = useState(false);

  const waypointOf = useCallback(
    (id: string, stored: { x: number; y: number } | null) => bends[id] ?? stored ?? null,
    [bends],
  );

  // Для каждого блока считаем, сколько связей в него входит и в каком порядке.
  const entryIndex = new Map<string, { index: number; total: number }>();
  {
    const incoming = new Map<string, string[]>();
    for (const block of blocks) {
      for (const button of block.buttons) {
        if (!button.targetBlockId) continue;
        incoming.set(button.targetBlockId, [
          ...(incoming.get(button.targetBlockId) ?? []),
          button.id,
        ]);
      }
      if (block.nextBlockId) {
        incoming.set(block.nextBlockId, [
          ...(incoming.get(block.nextBlockId) ?? []),
          `next-${block.id}`,
        ]);
      }
    }
    for (const [, links] of incoming) {
      links.forEach((linkId, index) =>
        entryIndex.set(linkId, { index, total: links.length }),
      );
    }
  }

  const positionOf = useCallback(
    (id: string) => positions[id] ?? { x: 0, y: 0 },
    [positions],
  );

  /** Экранные координаты → координаты схемы. */
  const toWorld = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const box = surfaceRef.current?.getBoundingClientRect();
      if (!box) return { x: 0, y: 0 };
      return {
        x: (event.clientX - box.left - view.x) / view.scale,
        y: (event.clientY - box.top - view.y) / view.scale,
      };
    },
    [view],
  );

  function onPointerMove(event: React.PointerEvent) {
    if (!drag) return;

    if (drag.kind === "pan") {
      setView((current) => ({
        ...current,
        x: drag.startView.x + (event.clientX - drag.startPointer.x),
        y: drag.startView.y + (event.clientY - drag.startPointer.y),
      }));
      return;
    }

    if (drag.kind === "block") {
      const dx = (event.clientX - drag.startPointer.x) / view.scale;
      const dy = (event.clientY - drag.startPointer.y) / view.scale;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) setMoved(true);
      setPositions((current) => ({
        ...current,
        [drag.id]: { x: drag.startPosition.x + dx, y: drag.startPosition.y + dy },
      }));
      return;
    }

    if (drag.kind === "bend") {
      const point = toWorld(event);
      setBends((current) => ({ ...current, [drag.link.id]: point }));
      setDrag({ ...drag, at: point });
      return;
    }

    setDrag({ ...drag, to: toWorld(event) });
  }

  async function onPointerUp(event: React.PointerEvent) {
    if (!drag) return;

    if (drag.kind === "block" && moved) {
      const position = positionOf(drag.id);
      await saveBlockPositions(scenarioId, [{ id: drag.id, ...position }]);
    }

    if (drag.kind === "bend") {
      await saveLinkWaypoint(drag.link.kind, drag.link.id, drag.at);
      setSelectedLink({ kind: drag.link.kind, id: drag.link.id, at: drag.at });
      setDrag(null);
      setMoved(false);
      return;
    }

    if (drag.kind === "link") {
      // Отпустили над блоком — связываем кнопку с ним.
      const world = toWorld(event);
      const target = blocks.find((block) => {
        const position = positionOf(block.id);
        return (
          world.x >= position.x &&
          world.x <= position.x + BLOCK_WIDTH &&
          world.y >= position.y &&
          world.y <= position.y + blockHeight(block.buttons.length)
        );
      });
      await connectButton(drag.buttonId, target?.id ?? null);
      router.refresh();
    }

    setDrag(null);
    setMoved(false);
  }

  function onWheel(event: React.WheelEvent) {
    const box = surfaceRef.current?.getBoundingClientRect();
    if (!box) return;

    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const scale = Math.min(2, Math.max(0.3, view.scale * factor));
    // Масштабируем к курсору, чтобы схема не «убегала».
    const pointerX = event.clientX - box.left;
    const pointerY = event.clientY - box.top;

    setView((current) => ({
      scale,
      x: pointerX - ((pointerX - current.x) / current.scale) * scale,
      y: pointerY - ((pointerY - current.y) / current.scale) * scale,
    }));
  }

  async function addBlock() {
    const box = surfaceRef.current?.getBoundingClientRect();
    const center = box
      ? { x: (box.width / 2 - view.x) / view.scale, y: (box.height / 2 - view.y) / view.scale }
      : { x: 100, y: 100 };

    const created = await createBlockAt(scenarioId, center.x, center.y);
    setPositions((current) => ({ ...current, [created.id]: center }));
    onSelect(created.id);
    router.refresh();
  }

  async function relayout() {
    const next = autoLayout(blocks);
    setPositions(next);
    await saveBlockPositions(
      scenarioId,
      Object.entries(next).map(([id, point]) => ({ id, ...point })),
    );
  }

  /** Подбирает масштаб и сдвиг так, чтобы вся схема поместилась на экран. */
  const fitView = useCallback(() => {
    const box = surfaceRef.current?.getBoundingClientRect();
    if (!box || blocks.length === 0) return;
    const xs = blocks.map((block) => positionOf(block.id).x);
    const ys = blocks.map((block) => positionOf(block.id).y);
    const minX = Math.min(...xs) - 40;
    const minY = Math.min(...ys) - 40;
    const maxX = Math.max(...xs) + BLOCK_WIDTH + 40;
    const maxY =
      Math.max(...blocks.map((block) => positionOf(block.id).y + blockHeight(block.buttons.length))) + 40;
    const scale = Math.min(1, Math.max(0.3, Math.min(box.width / (maxX - minX), box.height / (maxY - minY))));
    setView({
      scale,
      x: (box.width - (maxX - minX) * scale) / 2 - minX * scale,
      y: (box.height - (maxY - minY) * scale) / 2 - minY * scale,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

  // При открытии показываем всю схему целиком.
  useEffect(() => {
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId]);

  const linkFrom = drag?.kind === "link" ? drag.from : null;
  const linkTo = drag?.kind === "link" ? drag.to : null;

  const toolButton =
    "whitespace-nowrap rounded-lg border border-[var(--line)] bg-white px-2.5 py-1.5 text-sm hover:border-[var(--accent)] hover:text-[var(--accent)]";

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
      <div
        ref={surfaceRef}
        className="absolute inset-0 touch-none"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget || event.currentTarget === event.target) {
            setDrag({
              kind: "pan",
              startPointer: { x: event.clientX, y: event.clientY },
              startView: { x: view.x, y: view.y },
            });
            onSelect(null);
            setSelectedLink(null);
          }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => void onPointerUp(event)}
        onPointerLeave={() => setDrag(null)}
        onWheel={onWheel}
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)",
          backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 8 8"
                refX={7}
                refY={4}
                markerWidth={7}
                markerHeight={7}
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 7 4 L 0 7 z" fill="#94a3b8" />
              </marker>
              <marker
                id="arrow-active"
                viewBox="0 0 8 8"
                refX={7}
                refY={4}
                markerWidth={7}
                markerHeight={7}
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 7 4 L 0 7 z" fill="var(--accent)" />
              </marker>
            </defs>

            {blocks.flatMap((block) =>
              block.buttons.map((button, index) => {
                if (!button.targetBlockId) return null;
                const target = blocks.find((item) => item.id === button.targetBlockId);
                if (!target) return null;

                const from = positionOf(block.id);
                const to = positionOf(target.id);
                const port = buttonPortOffset(index);
                // Когда экран выбран, его связи выделяем, остальные приглушаем.
                const related =
                  !selectedId || block.id === selectedId || target.id === selectedId;

                // Линии «в меню» показываем только для выбранного экрана.
                const isReturn = target.isStart;
                const involved = block.id === selectedId || target.id === selectedId;
                if (isReturn && !showReturns && !involved) return null;

                const slot = entryIndex.get(button.id) ?? { index: 0, total: 1 };
                const entry = entryPoint(
                  { x: to.x, y: to.y, buttonCount: target.buttons.length },
                  slot.index,
                  slot.total,
                );
                const start = { x: from.x + port.x, y: from.y + port.y };
                const end = { x: entry.x - 8, y: entry.y };
                const bend = waypointOf(button.id, button.waypoint);
                const path = connectorPath(start, end, bend);
                const highlighted =
                  block.id === selectedId ||
                  target.id === selectedId ||
                  selectedLink?.id === button.id;

                return (
                  <g key={button.id}>
                    <path
                      d={path}
                      fill="none"
                      stroke={highlighted ? "var(--accent)" : "#94a3b8"}
                      strokeWidth={highlighted ? 2 : 1.5}
                      strokeOpacity={related || selectedLink?.id === button.id ? 0.9 : 0.15}
                      markerEnd={highlighted ? "url(#arrow-active)" : "url(#arrow)"}
                    />
                    {/* Широкая прозрачная линия поверх — чтобы в связь было легко попасть курсором. */}
                    <path
                      d={path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedLink({
                          kind: "button",
                          id: button.id,
                          at: connectorMidpoint(start, end, bend),
                        });
                      }}
                    />
                  </g>
                );
              }),
            )}

            {blocks.map((block) => {
              if (!block.nextBlockId) return null;
              const target = blocks.find((item) => item.id === block.nextBlockId);
              if (!target) return null;

              const from = positionOf(block.id);
              const to = positionOf(target.id);

              const start = {
                x: from.x + BLOCK_WIDTH,
                y: from.y + blockHeight(block.buttons.length) / 2,
              };
              const slot = entryIndex.get(`next-${block.id}`) ?? { index: 0, total: 1 };
              const entry = entryPoint(
                { x: to.x, y: to.y, buttonCount: target.buttons.length },
                slot.index,
                slot.total,
              );
              const end = { x: entry.x - 8, y: entry.y };
              const bend = waypointOf(block.id, block.nextWaypoint);
              const path = connectorPath(start, end, bend);

              return (
                <g key={`next-${block.id}`}>
                  <path
                    d={path}
                    fill="none"
                    stroke={selectedLink?.id === block.id ? "var(--accent)" : "#a78bfa"}
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    strokeOpacity={
                      !selectedId || block.id === selectedId || target.id === selectedId ? 0.9 : 0.15
                    }
                    markerEnd="url(#arrow)"
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedLink({
                        kind: "next",
                        id: block.id,
                        at: connectorMidpoint(start, end, bend),
                      });
                    }}
                  />
                </g>
              );
            })}

            {linkFrom && linkTo ? (
              <path
                d={connectorPath(linkFrom, linkTo)}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                strokeDasharray="4 4"
              />
            ) : null}
          </svg>

          {selectedLink ? (
            <div
              className="absolute z-10 flex items-center gap-1 rounded-full border border-[var(--line)] bg-white px-1.5 py-1 shadow-sm"
              style={{ left: selectedLink.at.x - 48, top: selectedLink.at.y - 16 }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                title="Потяните, чтобы отвести линию в сторону"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setDrag({ kind: "bend", link: selectedLink, at: selectedLink.at });
                }}
                className="flex h-6 w-6 cursor-move items-center justify-center rounded-full text-xs text-[var(--muted)] hover:bg-[var(--bg)]"
              >
                ✥
              </button>
              <button
                type="button"
                title="Выпрямить линию"
                onClick={async () => {
                  await saveLinkWaypoint(selectedLink.kind, selectedLink.id, null);
                  setBends((current) => {
                    const next = { ...current };
                    delete next[selectedLink.id];
                    return next;
                  });
                  setSelectedLink(null);
                  router.refresh();
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-[var(--muted)] hover:bg-[var(--bg)]"
              >
                ↔
              </button>
              <button
                type="button"
                title="Удалить связь"
                onClick={async () => {
                  if (selectedLink.kind === "button") {
                    await connectButton(selectedLink.id, null);
                  } else {
                    await clearNextBlock(selectedLink.id);
                  }
                  setSelectedLink(null);
                  router.refresh();
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs hover:bg-red-50"
              >
                🗑
              </button>
            </div>
          ) : null}

          {blocks.map((block) => {
            const position = positionOf(block.id);
            const active = block.id === selectedId;

            return (
              <div
                key={block.id}
                className={`absolute cursor-pointer rounded-xl border-2 bg-white shadow-sm transition-shadow hover:shadow-md ${
                  active
                    ? "border-[var(--accent)] shadow-md ring-4 ring-[var(--accent)]/15"
                    : "border-[var(--line)] hover:border-[var(--accent)]/60"
                }`}
                style={{ left: position.x, top: position.y, width: BLOCK_WIDTH }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setDrag({
                    kind: "block",
                    id: block.id,
                    startPointer: { x: event.clientX, y: event.clientY },
                    startPosition: position,
                  });
                }}
                onClick={() => {
                  if (!moved) onSelect(block.id);
                }}
              >
                <div
                  className="flex items-center justify-between gap-2 rounded-t-xl border-b border-[var(--line)] px-3"
                  style={{ height: HEADER_HEIGHT }}
                >
                  <span className="truncate text-[13px] font-semibold">{block.title}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {stats[block.id]?.sent ? (
                      <span
                        title={`Доставлено ${stats[block.id].sent} чел.`}
                        className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] tabular-nums text-emerald-700"
                      >
                        ✓ {stats[block.id].sent}
                      </span>
                    ) : null}
                    {stats[block.id]?.errors ? (
                      <span
                        title={`Не доставлено ${stats[block.id].errors}${stats[block.id].lastError ? `: ${stats[block.id].lastError}` : ""}`}
                        className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] tabular-nums text-red-700"
                      >
                        ⚠ {stats[block.id].errors}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      title="Дублировать экран"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDuplicate(block.id);
                      }}
                      className="rounded px-1 text-[11px] text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--accent)]"
                    >
                      ⧉
                    </button>
                    {block.kind !== "MESSAGE" ? (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${KIND_BADGE[block.kind].className}`}
                      >
                        {KIND_BADGE[block.kind].label}
                      </span>
                    ) : null}
                    {block.isStart ? (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                        старт
                      </span>
                    ) : null}
                  </span>
                </div>

                <div
                  className="overflow-hidden px-3 py-2 text-xs text-[var(--muted)]"
                  style={{ height: TEXT_HEIGHT }}
                >
                  {block.kind === "REQUEST"
                    ? `${block.method ?? "GET"} ${block.url ?? "адрес не задан"}`
                    : block.kind === "CODE"
                      ? "Свой код"
                      : block.kind === "CONDITION"
                        ? `Правил: ${block.conditionCount}`
                        : block.kind === "DELAY"
                          ? `Пауза ${block.delaySeconds ?? 0} сек.`
                          : block.kind === "HANDOFF"
                            ? "Передать оператору"
                            : `${block.imageId ? "🖼 " : ""}${block.text}`}
                </div>

                {block.buttons.map((button, index) => (
                  <div
                    key={button.id}
                    className="relative flex items-center px-3"
                    style={{ height: BUTTON_HEIGHT }}
                  >
                    <span className="flex w-full items-center gap-1 rounded-md border border-[var(--line)] px-2 py-0.5 text-[11px]">
                      <span className="min-w-0 flex-1 truncate">{button.label}</span>
                      {stats[block.id]?.sent ? (
                        <span
                          className="shrink-0 rounded bg-[var(--bg)] px-1 text-[10px] tabular-nums text-[var(--muted)]"
                          title="Нажали · доля от получивших"
                        >
                          {stats[block.id].clicks[button.id] ?? 0} ·{" "}
                          {Math.round(((stats[block.id].clicks[button.id] ?? 0) / stats[block.id].sent) * 100)}%
                        </span>
                      ) : null}
                    </span>
                    <span
                      title="Потяните к нужному экрану"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        const port = buttonPortOffset(index);
                        setDrag({
                          kind: "link",
                          buttonId: button.id,
                          from: { x: position.x + port.x, y: position.y + port.y },
                          to: toWorld(event),
                        });
                      }}
                      className={`absolute -right-1.5 h-3 w-3 cursor-crosshair rounded-full border-2 border-white ${
                        button.url
                          ? "bg-emerald-500"
                          : button.targetBlockId
                            ? "bg-[var(--accent)]"
                            : "bg-slate-400"
                      }`}
                    />
                  </div>
                ))}

                <div style={{ height: 10 }} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute left-3 right-3 top-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white/95 p-1.5 shadow-sm backdrop-blur xl:right-auto">
        <button type="button" onClick={() => void addBlock()} className="whitespace-nowrap rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:opacity-90">
          + Экран
        </button>
        <span className="mx-1 h-5 w-px bg-[var(--line)]" />
        <button type="button" onClick={fitView} title="Показать всю схему" className={toolButton}>
          ⤢ Вся схема
        </button>
        <button type="button" onClick={() => void relayout()} title="Расставить экраны автоматически" className={toolButton}>
          ✦ Разложить
        </button>
        <button
          type="button"
          onClick={() => setShowReturns((current) => !current)}
          title="Показать линии, ведущие на стартовый экран"
          className={`${toolButton} ${showReturns ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}
        >
          ↩ Возвраты
        </button>
      </div>

      <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-xl border border-[var(--line)] bg-white/95 p-1 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => setView((current) => ({ ...current, scale: Math.max(0.3, current.scale / 1.2) }))}
          className="h-8 w-8 rounded-lg text-base hover:bg-[var(--bg)]"
          title="Уменьшить"
        >
          −
        </button>
        <span className="w-12 text-center text-xs tabular-nums text-[var(--muted)]">
          {Math.round(view.scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setView((current) => ({ ...current, scale: Math.min(2, current.scale * 1.2) }))}
          className="h-8 w-8 rounded-lg text-base hover:bg-[var(--bg)]"
          title="Увеличить"
        >
          +
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg bg-white/80 px-2 py-1 text-[11px] text-[var(--muted)]">
        Тяните экраны мышью · колесо — масштаб · за кружок у кнопки — связь
      </div>
    </div>
  );
}
