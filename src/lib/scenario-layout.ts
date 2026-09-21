/** Геометрия схемы: одинаковые размеры нужны и блокам, и стрелкам. */
export const BLOCK_WIDTH = 260;
export const HEADER_HEIGHT = 34;
export const TEXT_HEIGHT = 52;
export const BUTTON_HEIGHT = 30;
export const BLOCK_PADDING = 10;

export type LayoutBlock = {
  id: string;
  isStart: boolean;
  nextBlockId?: string | null;
  buttons: { id: string; targetBlockId: string | null }[];
};

export function blockHeight(buttonCount: number): number {
  return HEADER_HEIGHT + TEXT_HEIGHT + buttonCount * BUTTON_HEIGHT + BLOCK_PADDING;
}

/** Точка, из которой выходит стрелка кнопки. */
export function buttonPortOffset(index: number): { x: number; y: number } {
  return {
    x: BLOCK_WIDTH,
    y: HEADER_HEIGHT + TEXT_HEIGHT + index * BUTTON_HEIGHT + BUTTON_HEIGHT / 2,
  };
}

/**
 * Раскладывает блоки по уровням: стартовый слева, следующие — правее.
 * Внутри уровня блоки сортируются по среднему положению родителей —
 * так линии реже пересекаются.
 */
export function autoLayout(blocks: LayoutBlock[]): Record<string, { x: number; y: number }> {
  const start = blocks.find((block) => block.isStart) ?? blocks[0];
  const level = new Map<string, number>();
  const queue: string[] = [];

  if (start) {
    level.set(start.id, 0);
    queue.push(start.id);
  }

  const targetsOf = (block: LayoutBlock) => [
    ...block.buttons.map((button) => button.targetBlockId),
    block.nextBlockId ?? null,
  ];

  while (queue.length) {
    const id = queue.shift()!;
    const current = blocks.find((block) => block.id === id);
    if (!current) continue;

    for (const target of targetsOf(current)) {
      if (!target || level.has(target)) continue;
      level.set(target, (level.get(id) ?? 0) + 1);
      queue.push(target);
    }
  }

  const maxLevel = Math.max(0, ...level.values());
  for (const block of blocks) {
    if (!level.has(block.id)) level.set(block.id, maxLevel + 1);
  }

  const byLevel = new Map<number, string[]>();
  for (const block of blocks) {
    const value = level.get(block.id) ?? 0;
    byLevel.set(value, [...(byLevel.get(value) ?? []), block.id]);
  }

  const positions: Record<string, { x: number; y: number }> = {};
  const order = new Map<string, number>();

  for (const value of [...byLevel.keys()].sort((a, b) => a - b)) {
    const ids = byLevel.get(value) ?? [];

    // Сортируем по среднему положению родителей на предыдущем уровне.
    const weight = new Map<string, number>();
    for (const id of ids) {
      const parents = blocks.filter((block) => targetsOf(block).includes(id));
      const values = parents
        .map((parent) => order.get(parent.id))
        .filter((position): position is number => position !== undefined);
      weight.set(id, values.length ? values.reduce((a, b) => a + b, 0) / values.length : 1e6);
    }

    const sorted = [...ids].sort((a, b) => (weight.get(a) ?? 0) - (weight.get(b) ?? 0));

    let y = 60;
    sorted.forEach((id, index) => {
      const block = blocks.find((item) => item.id === id);
      positions[id] = { x: 60 + value * (BLOCK_WIDTH + 160), y };
      order.set(id, index);
      y += blockHeight(block?.buttons.length ?? 0) + 60;
    });
  }

  return positions;
}

/**
 * Путь от кнопки к левому краю целевого блока: горизонталь — поворот — горизонталь,
 * со скруглёнными углами. Прямые отрезки читаются лучше кривых, когда связей много.
 * Если у связи задана своя точка перегиба, ведём линию через неё.
 */
export function connectorPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  waypoint?: { x: number; y: number } | null,
): string {
  const radius = 10;

  if (waypoint) {
    // Не даём линии уходить назад за точку выхода — иначе получается крючок.
    const bendX = Math.max(waypoint.x, from.x + 24);
    const r1 = Math.min(radius, Math.abs(waypoint.y - from.y) / 2);
    const r2 = Math.min(radius, Math.abs(to.y - waypoint.y) / 2);
    const down1 = waypoint.y >= from.y ? 1 : -1;
    const down2 = to.y >= waypoint.y ? 1 : -1;

    return [
      `M ${from.x},${from.y}`,
      `H ${bendX - r1}`,
      `Q ${bendX},${from.y} ${bendX},${from.y + down1 * r1}`,
      `V ${waypoint.y - down2 * r2}`,
      `Q ${bendX},${waypoint.y} ${bendX + r2},${waypoint.y}`,
      `H ${to.x - r2}`,
      `Q ${to.x},${waypoint.y} ${to.x},${waypoint.y + down2 * r2}`,
      `V ${to.y}`,
    ].join(" ");
  }

  const dy = to.y - from.y;
  const forward = to.x > from.x + 60;

  if (Math.abs(dy) < 2) return `M ${from.x},${from.y} H ${to.x}`;

  const down = dy > 0 ? 1 : -1;
  const r = Math.min(radius, Math.abs(dy) / 2);

  if (forward) {
    const mid = (from.x + to.x) / 2;
    return [
      `M ${from.x},${from.y}`,
      `H ${mid - r}`,
      `Q ${mid},${from.y} ${mid},${from.y + down * r}`,
      `V ${to.y - down * r}`,
      `Q ${mid},${to.y} ${mid + r},${to.y}`,
      `H ${to.x}`,
    ].join(" ");
  }

  const out = from.x + 28;
  const back = to.x - 28;
  return [
    `M ${from.x},${from.y}`,
    `H ${out - r}`,
    `Q ${out},${from.y} ${out},${from.y + down * r}`,
    `V ${to.y - down * r}`,
    `Q ${out},${to.y} ${out - r},${to.y}`,
    `H ${back}`,
    `M ${back},${to.y}`,
    `H ${to.x}`,
  ].join(" ");
}

/** Середина связи — там показываем ручку перетаскивания и корзину. */
export function connectorMidpoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  waypoint?: { x: number; y: number } | null,
): { x: number; y: number } {
  if (waypoint) return waypoint;
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}


/**
 * Точка входа в блок. Когда в один экран ведёт много связей (обычно это
 * «вернуться в меню»), разводим их по левому краю, чтобы линии не ложились
 * друг на друга.
 */
export function entryPoint(
  block: { x: number; y: number; buttonCount: number },
  index: number,
  total: number,
): { x: number; y: number } {
  const height = blockHeight(block.buttonCount);
  if (total <= 1) return { x: block.x, y: block.y + height / 2 };

  // Держим точки внутри блока и не ближе 10px друг к другу.
  const usable = Math.min(height - 16, (total - 1) * 14);
  const step = total > 1 ? usable / (total - 1) : 0;
  const first = block.y + height / 2 - usable / 2;

  return { x: block.x, y: first + index * step };
}
