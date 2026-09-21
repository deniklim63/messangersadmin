"use client";

import { useState } from "react";
import type { DayPoint } from "@/lib/analytics";

// Палитра проверена валидатором dataviz: обе серии проходят CVD и контраст.
const COLOR_JOINED = "#2a78d6";
const COLOR_LEFT = "#e34948";
const COLOR_TOTAL = "#2a78d6";

const WIDTH = 720;
const HEIGHT = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 34 };

function formatDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}.${month}`;
}

/** Подписи не на каждом дне — иначе ось превращается в кашу. */
function tickIndexes(count: number): number[] {
  const step = Math.max(1, Math.ceil(count / 8));
  const ticks: number[] = [];
  for (let index = 0; index < count; index += step) ticks.push(index);
  const last = ticks.at(-1) ?? 0;
  // Последнюю дату показываем, только если она не наедет на предыдущую подпись.
  if (last !== count - 1) {
    if (count - 1 - last >= step / 2) ticks.push(count - 1);
    else ticks[ticks.length - 1] = count - 1;
  }
  return ticks;
}

function niceMax(value: number): number {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function useHover(points: DayPoint[]) {
  const [index, setIndex] = useState<number | null>(null);

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * WIDTH;
    const inner = WIDTH - PAD.left - PAD.right;
    const step = inner / Math.max(1, points.length - 1 || 1);
    const guess = Math.round((x - PAD.left) / step);
    setIndex(Math.min(points.length - 1, Math.max(0, guess)));
  }

  return { index, onMove, onLeave: () => setIndex(null) };
}

function Tooltip({ point, right }: { point: DayPoint; right: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute top-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs shadow-sm ${
        right ? "right-2" : "left-12"
      }`}
    >
      <div className="font-medium">{formatDay(point.date)}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_JOINED }} />
        Подписались: <b className="tabular-nums">{point.joined}</b>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_LEFT }} />
        Отписались: <b className="tabular-nums">{point.left}</b>
      </div>
      <div className="mt-1 text-[var(--muted)]">
        Всего: <b className="tabular-nums">{point.total}</b>
      </div>
    </div>
  );
}

/** Сколько всего пользователей у бота — накопительным итогом по дням. */
export function TotalLineChart({ points }: { points: DayPoint[] }) {
  const { index, onMove, onLeave } = useHover(points);
  if (points.length === 0) return null;

  const max = niceMax(Math.max(...points.map((point) => point.total), 1));
  const inner = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const step = inner / Math.max(1, points.length - 1);

  const x = (i: number) => PAD.left + i * step;
  const y = (value: number) => PAD.top + innerHeight - (value / max) * innerHeight;

  const path = points.map((point, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(point.total)}`).join(" ");
  const hovered = index === null ? null : points[index];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        role="img"
        aria-label="Всего пользователей по дням"
      >
        {[0, 0.5, 1].map((ratio) => (
          <g key={ratio}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(max * ratio)}
              y2={y(max * ratio)}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text x={4} y={y(max * ratio) + 4} fontSize={11} fill="var(--muted)">
              {Math.round(max * ratio)}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke={COLOR_TOTAL} strokeWidth={2} strokeLinejoin="round" />

        {points.length === 1 ? (
          <circle cx={x(0)} cy={y(points[0].total)} r={4} fill={COLOR_TOTAL} />
        ) : null}

        {hovered && index !== null ? (
          <>
            <line
              x1={x(index)}
              x2={x(index)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
              stroke="var(--muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={x(index)}
              cy={y(hovered.total)}
              r={5}
              fill={COLOR_TOTAL}
              stroke="#fff"
              strokeWidth={2}
            />
          </>
        ) : null}

        {tickIndexes(points.length).map((i) => (
          <text
            key={i}
            x={x(i)}
            y={HEIGHT - 6}
            fontSize={11}
            fill="var(--muted)"
            textAnchor="middle"
          >
            {formatDay(points[i].date)}
          </text>
        ))}
      </svg>

      {hovered && index !== null ? (
        <Tooltip point={hovered} right={index > points.length / 2} />
      ) : null}
    </div>
  );
}

/** Подписки и отписки по дням — две серии рядом. */
export function JoinLeaveChart({ points }: { points: DayPoint[] }) {
  const { index, onMove, onLeave } = useHover(points);
  if (points.length === 0) return null;

  const max = niceMax(
    Math.max(...points.map((point) => Math.max(point.joined, point.left)), 1),
  );
  const inner = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const slot = inner / points.length;
  // 2px зазор между соседними столбиками, чтобы заливки не слипались.
  const barWidth = Math.max(2, Math.min(14, slot / 2 - 2));

  const baseline = PAD.top + innerHeight;
  const barHeight = (value: number) => (value / max) * innerHeight;
  const hovered = index === null ? null : points[index];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        role="img"
        aria-label="Подписки и отписки по дням"
      >
        {[0, 0.5, 1].map((ratio) => (
          <g key={ratio}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={baseline - innerHeight * ratio}
              y2={baseline - innerHeight * ratio}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text x={4} y={baseline - innerHeight * ratio + 4} fontSize={11} fill="var(--muted)">
              {Math.round(max * ratio)}
            </text>
          </g>
        ))}

        {points.map((point, i) => {
          const center = PAD.left + slot * i + slot / 2;
          return (
            <g key={point.date}>
              {index === i ? (
                <rect
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={innerHeight}
                  fill="var(--bg)"
                />
              ) : null}
              <rect
                x={center - barWidth - 1}
                y={baseline - barHeight(point.joined)}
                width={barWidth}
                height={barHeight(point.joined)}
                rx={Math.min(4, barWidth / 2)}
                fill={COLOR_JOINED}
              />
              <rect
                x={center + 1}
                y={baseline - barHeight(point.left)}
                width={barWidth}
                height={barHeight(point.left)}
                rx={Math.min(4, barWidth / 2)}
                fill={COLOR_LEFT}
              />
            </g>
          );
        })}

        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={baseline}
          y2={baseline}
          stroke="var(--line)"
          strokeWidth={1}
        />

        {tickIndexes(points.length).map((i) => (
          <text
            key={i}
            x={PAD.left + slot * i + slot / 2}
            y={HEIGHT - 6}
            fontSize={11}
            fill="var(--muted)"
            textAnchor="middle"
          >
            {formatDay(points[i].date)}
          </text>
        ))}
      </svg>

      {hovered && index !== null ? (
        <Tooltip point={hovered} right={index > points.length / 2} />
      ) : null}
    </div>
  );
}

export function ChartLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--muted)]">
      <span className="flex items-center gap-2">
        <span className="inline-block h-2 w-4 rounded-sm" style={{ background: COLOR_JOINED }} />
        Подписались
      </span>
      <span className="flex items-center gap-2">
        <span className="inline-block h-2 w-4 rounded-sm" style={{ background: COLOR_LEFT }} />
        Отписались
      </span>
    </div>
  );
}
