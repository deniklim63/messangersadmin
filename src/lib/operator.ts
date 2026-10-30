import { logMessage } from "@/lib/contacts";
import { prisma } from "@/lib/db";

type Who = { subscriberId: string; botId: string; contactId: string | null };

/**
 * Передаёт диалог живому человеку и оставляет в переписке системную отметку —
 * во «Входящих» видно, где и почему бот вышел из сценария.
 */
export async function handToOperator(who: Who, reason: string): Promise<void> {
  await prisma.subscriber.update({
    where: { id: who.subscriberId },
    data: { needsOperator: true, operatorSince: new Date() },
  });
  await logMessage({
    botId: who.botId,
    subscriberId: who.subscriberId,
    contactId: who.contactId,
    direction: "OUT",
    text: `🙋 Бот передал диалог оператору — ${reason}`,
    source: "system",
  });
}

/** Возвращает диалог боту и отмечает это в переписке. */
export async function returnToBot(who: Who, reason: string): Promise<void> {
  const subscriber = await prisma.subscriber.findUnique({
    where: { id: who.subscriberId },
    select: { needsOperator: true },
  });
  if (!subscriber?.needsOperator) return;
  await prisma.subscriber.update({
    where: { id: who.subscriberId },
    data: { needsOperator: false, operatorSince: null },
  });
  await logMessage({
    botId: who.botId,
    subscriberId: who.subscriberId,
    contactId: who.contactId,
    direction: "OUT",
    text: `🤖 Диалог возвращён боту — ${reason}`,
    source: "system",
  });
}
