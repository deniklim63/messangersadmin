/** Подстановка {{переменных}} в тексты, адреса и тела запросов. */

export type VariableScope = Record<string, unknown>;

/** Достаёт значение по пути вида «order.status» или «items.0.name». */
export function readPath(scope: VariableScope, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((value, key) => {
      if (value === null || value === undefined) return undefined;
      if (Array.isArray(value)) return value[Number(key)];
      if (typeof value === "object") return (value as Record<string, unknown>)[key];
      return undefined;
    }, scope);
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Заменяет {{path}} на значение; неизвестное — на пустую строку. */
export function render(template: string, scope: VariableScope): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) =>
    stringify(readPath(scope, path)),
  );
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Готовые даты — чтобы не считать их кодом.
 * Неделя и выходные считаются от сегодняшнего дня по московскому времени.
 */
function dateScope(): VariableScope {
  const now = new Date();
  const day = now.getUTCDay(); // 0 — воскресенье

  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const weekEnd = new Date(now);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  // Для подборок по формату и сложности неделя часто пустая — смотрим шире.
  const monthEnd = new Date(now);
  monthEnd.setUTCDate(monthEnd.getUTCDate() + 30);

  // Ближайшая суббота (если сегодня суббота или воскресенье — текущие выходные).
  const toSaturday = day === 6 ? 0 : day === 0 ? -1 : 6 - day;
  const saturday = new Date(now);
  saturday.setUTCDate(saturday.getUTCDate() + toSaturday);
  const sunday = new Date(saturday);
  sunday.setUTCDate(sunday.getUTCDate() + 1);

  return {
    today: isoDate(now),
    tomorrow: isoDate(tomorrow),
    weekEnd: isoDate(weekEnd),
    monthEnd: isoDate(monthEnd),
    weekendStart: isoDate(saturday),
    weekendEnd: isoDate(sunday),
  };
}

/** Переменные человека, доступные в сценарии. */
export function buildScope(params: {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  username?: string | null;
  externalId?: string;
  variables?: unknown;
}): VariableScope {
  const custom =
    params.variables && typeof params.variables === "object" && !Array.isArray(params.variables)
      ? (params.variables as Record<string, unknown>)
      : {};

  return {
    ...dateScope(),
    ...custom,
    name: params.name ?? "",
    phone: params.phone ?? "",
    email: params.email ?? "",
    city: params.city ?? "",
    username: params.username ?? "",
    externalId: params.externalId ?? "",
  };
}


export type ListSettings = {
  listSource?: string | null;
  listTemplate?: string | null;
  listEmpty?: string | null;
  listLimit?: number | null;
};

/**
 * Собирает текст сообщения вместе со списком: берёт массив из переменной,
 * рисует каждый элемент по шаблону и вставляет на место {{list}}
 * (или в конец текста, если метки нет).
 */
export function renderMessage(text: string, block: ListSettings, scope: VariableScope): string {
  const base = render(text, scope);
  if (!block.listSource || !block.listTemplate) return base;

  const source = readPath(scope, block.listSource);
  const items = Array.isArray(source) ? source : [];
  const limited = block.listLimit ? items.slice(0, block.listLimit) : items;

  const rendered = limited
    .map((item, index) =>
      render(block.listTemplate as string, {
        ...scope,
        ...(item && typeof item === "object" ? (item as VariableScope) : { value: item }),
        index: index + 1,
      }),
    )
    .join("\n");

  const list = (rendered || render(block.listEmpty ?? "", scope)).trim();

  const merged = base.includes("{{list}}")
    ? base.replace(/\{\{\s*list\s*\}\}/g, list)
    : `${base}\n\n${list}`;

  // Схлопываем лишние пустые строки: шаблон строки часто заканчивается переносом.
  return merged.replace(/\n{3,}/g, "\n\n").trim();
}
