import type { Prisma } from "@/generated/prisma/client";

/**
 * Кому уйдёт сообщение: активные подписчики бота.
 * Пустой список городов — значит всем; "none" в списке — те, у кого город не указан.
 */
export function recipientsWhere(botId: string, cities: string[] = []): Prisma.SubscriberWhereInput {
  if (cities.length === 0) return { botId, status: "ACTIVE" };

  const slugs = cities.filter((city) => city !== "none");
  const or: Prisma.ContactWhereInput[] = [];
  if (slugs.length) or.push({ city: { slug: { in: slugs } } });
  if (cities.includes("none")) or.push({ cityId: null });

  return { botId, status: "ACTIVE", contact: { OR: or } };
}
