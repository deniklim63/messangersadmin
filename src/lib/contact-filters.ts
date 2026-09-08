import type { Prisma } from "@/generated/prisma/client";

export type ContactFilters = {
  q?: string;
  city?: string;
  bot?: string;
  /** "1" — только те, кто есть больше чем в одном боте. */
  multi?: string;
};

export function parseFilters(params: Record<string, string | string[] | undefined>): ContactFilters {
  const get = (key: string) => {
    const value = params[key];
    const raw = Array.isArray(value) ? value[0] : value;
    return raw?.trim() ? raw.trim() : undefined;
  };
  return { q: get("q"), city: get("city"), bot: get("bot"), multi: get("multi") };
}

export function buildWhere(filters: ContactFilters): Prisma.ContactWhereInput {
  const and: Prisma.ContactWhereInput[] = [];

  if (filters.q) {
    const q = filters.q;
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q.replace(/[^\d+]/g, "") || q } },
        { phoneRaw: { contains: q } },
        { subscribers: { some: { username: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  if (filters.city) {
    and.push(filters.city === "none" ? { cityId: null } : { city: { slug: filters.city } });
  }

  if (filters.bot) {
    and.push({ subscribers: { some: { botId: filters.bot } } });
  }

  return and.length ? { AND: and } : {};
}

export function filtersToQuery(filters: ContactFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** id людей, которые есть больше чем в одном боте (в Prisma это не выражается через where). */
export async function multiBotContactIds(
  prismaClient: { $queryRawUnsafe: (sql: string) => Promise<{ contactId: string }[]> },
): Promise<string[]> {
  const rows = await prismaClient.$queryRawUnsafe(
    `SELECT "contactId" FROM "Subscriber" GROUP BY "contactId" HAVING COUNT(DISTINCT "botId") > 1`,
  );
  return rows.map((row) => row.contactId);
}
