import { ingestContact } from "@/lib/contacts";
import { prisma } from "@/lib/db";

export type ImportRow = {
  /** id пользователя в мессенджере: для ВК — числовой user_id. */
  externalId: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  /** Дата первого контакта из выгрузки — чтобы аналитика не считала всех «сегодняшними». */
  subscribedAt?: string | null;
};

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
};

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Выгрузки отдают либо ISO, либо «31.12.2025 14:05».
  const ru = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ ,]+(\d{2}):(\d{2}))?/);
  const date = ru
    ? new Date(
        Date.UTC(
          Number(ru[3]),
          Number(ru[2]) - 1,
          Number(ru[1]),
          Number(ru[4] ?? 0),
          Number(ru[5] ?? 0),
        ),
      )
    : new Date(trimmed);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** Заливает пачку строк из выгрузки в базу, склеивая дубли по телефону и e-mail. */
export async function importRows(botId: string, rows: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const [index, row] of rows.entries()) {
    const externalId = row.externalId?.toString().trim();
    if (!externalId) {
      result.skipped += 1;
      continue;
    }

    try {
      const existing = await prisma.subscriber.findUnique({
        where: { botId_externalId: { botId, externalId } },
        select: { id: true },
      });

      const { subscriber } = await ingestContact({
        botId,
        externalId,
        name: row.name,
        phone: row.phone,
        email: row.email,
        city: row.city,
        // Данные из выгрузки не перетирают то, что человек сказал боту позже.
        fillEmptyOnly: Boolean(existing),
      });

      const subscribedAt = parseDate(row.subscribedAt);
      if (subscribedAt) {
        await prisma.subscriber.update({
          where: { id: subscriber.id },
          data: { createdAt: subscribedAt },
        });
        await prisma.contact.update({
          where: { id: subscriber.contactId },
          data: { createdAt: subscribedAt },
        });
      }

      if (existing) result.updated += 1;
      else result.created += 1;
    } catch (error) {
      result.errors.push({ row: index, reason: (error as Error).message });
    }
  }

  return result;
}
