/** Простой разбор CSV: кавычки, экранированные кавычки и переводы строк внутри полей. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((line) => line.some((cell) => cell.trim() !== ""));
}

/** Разделитель угадываем по первой строке: выгрузки бывают и с «;», и с «,». */
export function guessDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf("\n") + 1 || 500);
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (tabs > semicolons && tabs > commas) return "\t";
  return semicolons >= commas ? ";" : ",";
}

/**
 * Читаем файл: сначала UTF-8, а если получилась «кракозябра» — Windows-1251.
 * Выгрузки из российских сервисов часто отдают именно её.
 */
export function decodeBuffer(buffer: ArrayBuffer, encoding: "auto" | "utf-8" | "windows-1251") {
  if (encoding !== "auto") {
    return { text: new TextDecoder(encoding).decode(buffer), used: encoding };
  }

  const utf8 = new TextDecoder("utf-8").decode(buffer);
  const broken = (utf8.match(/�/g) ?? []).length;
  if (broken > 0) {
    return { text: new TextDecoder("windows-1251").decode(buffer), used: "windows-1251" as const };
  }
  return { text: utf8, used: "utf-8" as const };
}

export type FieldKey = "externalId" | "name" | "phone" | "email" | "city" | "subscribedAt";

const HINTS: Record<FieldKey, string[]> = {
  externalId: [
    "уникальный идентификатор в мессенджере",
    "уникальн",
    "platform_id",
    "platform id",
    "user_id",
    "vk id",
    "id в мессенджере",
  ],
  name: ["имя", "name", "фио", "имя клиента"],
  phone: ["телефон", "phone", "номер телефона", "тел"],
  email: ["email", "e-mail", "почта", "мейл"],
  city: ["город", "city"],
  subscribedAt: ["дата первого контакта", "дата подписки", "первый контакт", "created", "дата регистрации"],
};

/**
 * Пытаемся сами понять, какая колонка чему соответствует.
 * Точное совпадение важнее частичного: иначе «ID клиента» перехватывает «Имя»,
 * а «ID блока» — идентификатор пользователя.
 */
export function guessMapping(headers: string[]): Partial<Record<FieldKey, number>> {
  const mapping: Partial<Record<FieldKey, number>> = {};
  const used = new Set<number>();
  const lower = headers.map((header) => header.trim().toLowerCase());

  const find = (hints: string[], match: (header: string, hint: string) => boolean) =>
    lower.findIndex(
      (header, position) =>
        !used.has(position) && hints.some((hint) => match(header, hint)),
    );

  for (const [key, hints] of Object.entries(HINTS) as [FieldKey, string[]][]) {
    const index =
      find(hints, (header, hint) => header === hint) >= 0
        ? find(hints, (header, hint) => header === hint)
        : find(hints, (header, hint) => header.startsWith(hint)) >= 0
          ? find(hints, (header, hint) => header.startsWith(hint))
          : find(hints, (header, hint) => header.includes(hint));

    if (index >= 0) {
      mapping[key] = index;
      used.add(index);
    }
  }

  return mapping;
}
