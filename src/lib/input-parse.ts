import { normalizeEmail, normalizePhone } from "@/lib/normalize";

export type InputKind = "text" | "date" | "phone" | "email" | "city";

export type ParsedInput = { ok: boolean; value?: string; extra?: string; error?: string };

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Разбирает дату из живой речи: «12.09», «12.09.2026», «завтра», «12 сентября». */
export function parseUserDate(raw: string): string | null {
  const text = raw.trim().toLowerCase();
  const today = new Date();

  if (text === "сегодня") return iso(today);
  if (text === "завтра") {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() + 1);
    return iso(date);
  }
  if (text === "послезавтра") {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() + 2);
    return iso(date);
  }

  // 12.09.2026 или 12.09 (год подставляем текущий, а если дата уже прошла — следующий)
  const numeric = text.match(/^(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?$/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = numeric[3] ? Number(numeric[3]) : today.getUTCFullYear();
    if (year < 100) year += 2000;
    const date = new Date(Date.UTC(year, month - 1, day));
    // 31.02 превратилось бы в 3 марта — такие даты не принимаем.
    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCDate() !== day ||
      date.getUTCMonth() !== month - 1
    ) {
      return null;
    }
    if (!numeric[3] && date < today) date.setUTCFullYear(year + 1);
    return iso(date);
  }

  // 12 сентября
  const worded = text.match(/^(\d{1,2})\s+([а-яё]+)/);
  if (worded) {
    const month = MONTHS.findIndex((name) => name.startsWith(worded[2].slice(0, 4)));
    if (month >= 0) {
      const day = Number(worded[1]);
      const date = new Date(Date.UTC(today.getUTCFullYear(), month, day));
      if (date.getUTCDate() !== day) return null;
      if (date < today) date.setUTCFullYear(today.getUTCFullYear() + 1);
      return iso(date);
    }
  }

  return null;
}

/** Проверяет ответ человека по типу вопроса. */
export function parseInput(kind: InputKind, raw: string): ParsedInput {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Напишите ответ текстом." };

  if (kind === "date") {
    const date = parseUserDate(text);
    return date
      ? { ok: true, value: text, extra: date }
      : { ok: false, error: "Не понял дату. Напишите, например: 12.09 или «завтра»." };
  }

  if (kind === "phone") {
    const phone = normalizePhone(text);
    return phone
      ? { ok: true, value: phone }
      : { ok: false, error: "Не понял номер. Пример: +7 999 123-45-67" };
  }

  if (kind === "email") {
    const email = normalizeEmail(text);
    return email
      ? { ok: true, value: email }
      : { ok: false, error: "Это не похоже на e-mail. Пример: name@mail.ru" };
  }

  return { ok: true, value: text };
}
