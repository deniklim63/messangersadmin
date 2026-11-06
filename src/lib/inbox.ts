import { describeAttachments, type Attachment } from "@/lib/attachments";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { notifyRead } from "@/lib/events";

export type Conversation = {
  subscriberId: string;
  contactId: string;
  name: string;
  botId: string;
  botTitle: string;
  platform: "TELEGRAM" | "VK";
  status: string;
  lastText: string;
  lastDirection: "IN" | "OUT";
  lastAt: string;
  unread: number;
  needsOperator: boolean;
  operatorSince: string | null;
  lastSource: string | null;
};

type Row = Omit<Conversation, "lastAt" | "unread" | "operatorSince"> & {
  lastAt: Date;
  unread: number;
  operatorSince: Date | null;
};

export type ConversationFilter = {
  botId?: string | null;
  onlyOperator?: boolean;
  onlyUnread?: boolean;
  query?: string | null;
};

export type InboxFacets = {
  bots: { id: string; title: string; platform: "TELEGRAM" | "VK"; total: number; waiting: number }[];
  waiting: number;
};

/** Что есть в базе вообще: по каким ботам есть диалоги и сколько ждут оператора. */
export async function getInboxFacets(): Promise<InboxFacets> {
  const rows = await prisma.$queryRaw<
    { id: string; title: string; platform: "TELEGRAM" | "VK"; total: number; waiting: number }[]
  >`
    SELECT b.id, b.title, b.platform::text AS platform,
           count(*)::int AS total,
           count(*) FILTER (WHERE s."needsOperator")::int AS waiting
    FROM "Subscriber" s
    JOIN "Bot" b ON b.id = s."botId"
    WHERE EXISTS (SELECT 1 FROM "Message" m WHERE m."subscriberId" = s.id)
    GROUP BY b.id, b.title, b.platform
    ORDER BY total DESC`;
  return { bots: rows, waiting: rows.reduce((sum, row) => sum + row.waiting, 0) };
}

/** Список диалогов для «Входящих»: последнее сообщение и число непрочитанных. */
export async function getConversations(filter: ConversationFilter = {}): Promise<Conversation[]> {
  const needle = filter.query?.trim() ? `%${filter.query.trim()}%` : null;
  const conditions = [
    filter.botId ? Prisma.sql`s."botId" = ${filter.botId}` : Prisma.sql`true`,
    filter.onlyOperator ? Prisma.sql`s."needsOperator"` : Prisma.sql`true`,
    filter.onlyUnread ? Prisma.sql`u.unread > 0` : Prisma.sql`true`,
    needle
      ? Prisma.sql`(c.name ILIKE ${needle} OR s.username ILIKE ${needle} OR c.phone ILIKE ${needle} OR c.email ILIKE ${needle} OR lm.text ILIKE ${needle})`
      : Prisma.sql`true`,
  ];
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT s.id AS "subscriberId",
           c.id AS "contactId",
           COALESCE(NULLIF(c.name, ''), NULLIF(s.username, ''), c.phone, s."externalId") AS name,
           b.id AS "botId",
           b.title AS "botTitle",
           b.platform::text AS platform,
           s.status::text AS status,
           s."needsOperator" AS "needsOperator",
           s."operatorSince" AS "operatorSince",
           lm.source AS "lastSource",
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
      SELECT m.text, m.direction, m."createdAt", m.attachments, m.source
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
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY s."needsOperator" DESC, lm."createdAt" DESC
    LIMIT 200`;

  return rows.map((row) => ({
    ...row,
    lastAt: row.lastAt.toISOString(),
    operatorSince: row.operatorSince ? row.operatorSince.toISOString() : null,
  }));
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

/** Помечает прочитанными все диалоги разом — чтобы счётчик в меню не висел. */
export async function markAllRead(): Promise<number> {
  const now = new Date();
  const result = await prisma.subscriber.updateMany({
    where: {
      messages: {
        some: { direction: "IN" },
      },
    },
    data: { lastReadAt: now },
  });
  notifyRead("*");
  return result.count;
}

export type ChatMessage = {
  id: string;
  direction: "IN" | "OUT";
  text: string;
  createdAt: string;
  attachments: Attachment[];
  /** ai — ответ написал AI. */
  source: string | null;
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
      source: message.source,
    })),
  };
}
