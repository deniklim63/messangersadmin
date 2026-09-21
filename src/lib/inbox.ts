import { describeAttachments, type Attachment } from "@/lib/attachments";
import { prisma } from "@/lib/db";
import { notifyRead } from "@/lib/events";

export type Conversation = {
  subscriberId: string;
  contactId: string;
  name: string;
  botTitle: string;
  platform: "TELEGRAM" | "VK";
  status: string;
  lastText: string;
  lastDirection: "IN" | "OUT";
  lastAt: string;
  unread: number;
  needsOperator: boolean;
};

type Row = Omit<Conversation, "lastAt" | "unread"> & { lastAt: Date; unread: number };

/** Список диалогов для «Входящих»: последнее сообщение и число непрочитанных. */
export async function getConversations(): Promise<Conversation[]> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT s.id AS "subscriberId",
           c.id AS "contactId",
           COALESCE(NULLIF(c.name, ''), NULLIF(s.username, ''), c.phone, s."externalId") AS name,
           b.title AS "botTitle",
           b.platform::text AS platform,
           s.status::text AS status,
           s."needsOperator" AS "needsOperator",
           CASE
             WHEN lm.text <> '' THEN lm.text
             WHEN lm.attachments IS NOT NULL THEN '[вложение]'
             ELSE ''
           END AS "lastText",
           lm.direction::text AS "lastDirection",
           lm."createdAt" AS "lastAt",
           u.unread AS unread
    FROM "Subscriber" s
    JOIN "Contact" c ON c.id = s."contactId"
    JOIN "Bot" b ON b.id = s."botId"
    JOIN LATERAL (
      SELECT m.text, m.direction, m."createdAt", m.attachments
      FROM "Message" m
      WHERE m."subscriberId" = s.id
      ORDER BY m."createdAt" DESC
      LIMIT 1
    ) lm ON true
    JOIN LATERAL (
      SELECT count(*)::int AS unread
      FROM "Message" m
      WHERE m."subscriberId" = s.id
        AND m.direction = 'IN'
        AND (s."lastReadAt" IS NULL OR m."createdAt" > s."lastReadAt")
    ) u ON true
    ORDER BY lm."createdAt" DESC
    LIMIT 200`;

  return rows.map((row) => ({ ...row, lastAt: row.lastAt.toISOString() }));
}

export async function countUnread(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM "Message" m
    JOIN "Subscriber" s ON s.id = m."subscriberId"
    WHERE m.direction = 'IN'
      AND (s."lastReadAt" IS NULL OR m."createdAt" > s."lastReadAt")`;
  return rows[0]?.count ?? 0;
}

export async function markRead(subscriberId: string): Promise<void> {
  const subscriber = await prisma.subscriber.findUnique({
    where: { id: subscriberId },
    select: { lastReadAt: true },
  });
  if (!subscriber) return;

  const hadUnread = await prisma.message.findFirst({
    where: {
      subscriberId,
      direction: "IN",
      ...(subscriber.lastReadAt ? { createdAt: { gt: subscriber.lastReadAt } } : {}),
    },
    select: { id: true },
  });

  await prisma.subscriber.update({
    where: { id: subscriberId },
    data: { lastReadAt: new Date() },
  });

  // Пустых событий не шлём: иначе каждый опрос диалога дёргал бы все вкладки.
  if (hadUnread) notifyRead(subscriberId);
}

export type ChatMessage = {
  id: string;
  direction: "IN" | "OUT";
  text: string;
  createdAt: string;
  attachments: Attachment[];
};

export function parseAttachments(value: unknown): Attachment[] {
  return Array.isArray(value) ? (value as Attachment[]) : [];
}

export type Chat = {
  subscriberId: string;
  contactId: string;
  name: string;
  username: string | null;
  externalId: string;
  status: string;
  needsOperator: boolean;
  botTitle: string;
  platform: "TELEGRAM" | "VK";
  phone: string | null;
  email: string | null;
  city: string | null;
  messages: ChatMessage[];
};

/** Полная переписка диалога — используется и страницей, и опросом. */
export async function getChat(subscriberId: string): Promise<Chat | null> {
  const subscriber = await prisma.subscriber.findUnique({
    where: { id: subscriberId },
    include: { bot: true, contact: { include: { city: true } } },
  });
  if (!subscriber) return null;

  const messages = await prisma.message.findMany({
    where: { subscriberId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return {
    subscriberId,
    contactId: subscriber.contactId,
    name:
      subscriber.contact.name ||
      subscriber.username ||
      subscriber.contact.phone ||
      subscriber.externalId,
    username: subscriber.username,
    externalId: subscriber.externalId,
    status: subscriber.status,
    needsOperator: subscriber.needsOperator,
    botTitle: subscriber.bot.title,
    platform: subscriber.bot.platform,
    phone: subscriber.contact.phone,
    email: subscriber.contact.email,
    city: subscriber.contact.city?.name ?? null,
    messages: messages.map((message) => ({
      id: message.id,
      direction: message.direction,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
      attachments: parseAttachments(message.attachments),
    })),
  };
}
