import { readPath, type VariableScope } from "@/lib/template";

export type ConditionOperator =
  | "eq"
  | "ne"
  | "contains"
  | "empty"
  | "notEmpty"
  | "gt"
  | "lt";

export type ConditionRule = {
  /** Путь к данным человека: city, phone, order.status */
  field: string;
  operator: ConditionOperator;
  value?: string;
  targetBlockId?: string | null;
};

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: "равно",
  ne: "не равно",
  contains: "содержит",
  empty: "пусто",
  notEmpty: "заполнено",
  gt: "больше",
  lt: "меньше",
};

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Проверяет одно правило на данных человека. */
export function evaluateRule(rule: ConditionRule, scope: VariableScope): boolean {
  const raw = readPath(scope, rule.field);
  const left = asText(raw).trim().toLowerCase();
  const right = (rule.value ?? "").trim().toLowerCase();

  switch (rule.operator) {
    case "empty":
      return left.length === 0;
    case "notEmpty":
      return left.length > 0;
    case "eq":
      return left === right;
    case "ne":
      return left !== right;
    case "contains":
      return right.length > 0 && left.includes(right);
    case "gt":
    case "lt": {
      const leftNumber = Number(asText(raw).replace(",", "."));
      const rightNumber = Number((rule.value ?? "").replace(",", "."));
      if (Number.isNaN(leftNumber) || Number.isNaN(rightNumber)) return false;
      return rule.operator === "gt" ? leftNumber > rightNumber : leftNumber < rightNumber;
    }
    default:
      return false;
  }
}

/** Возвращает блок первого сработавшего правила. */
export function pickBranch(
  rules: ConditionRule[],
  scope: VariableScope,
): string | null {
  for (const rule of rules) {
    if (evaluateRule(rule, scope)) return rule.targetBlockId ?? null;
  }
  return null;
}

/** Читает правила из JSON-поля блока, отбрасывая мусор. */
export function parseRules(value: unknown): ConditionRule[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ConditionRule =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as ConditionRule).field === "string" &&
      typeof (item as ConditionRule).operator === "string",
  );
}
