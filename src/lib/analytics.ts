import { prisma } from "@/lib/db";

/** Дни считаем по московскому времени: сервер живёт в UTC, а смотрим мы на график из РФ. */
const TIMEZONE = "Europe/Moscow";

export type DayPoint = {
  /** YYYY-MM-DD */
  date: string;
  joined: number;
  left: number;
  /** Сколько активных пользователей было к концу этого дня. */
  total: number;
};

export type BotAnalytics = {
  botId: string;
  title: string;
  platform: "TELEGRAM" | "VK";
  /** Активных прямо сейчас. */
  active: number;
  /** Подписались за выбранный период. */
  joined: number;
  /** Отписались или заблокировали бота за период. */
  left: number;
  series: DayPoint[];
};

type DayRow = { day: Date; count: bigint };

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Все дни периода подряд — чтобы в графике не было дыр на датах без событий. */
function eachDay(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  const last = new Date(to);
  last.setUTCHours(0, 0, 0, 0);
  while (cursor <= last) {
    days.push(dayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

async function countByDay(
  botId: string,
  column: "createdAt" | "unsubscribedAt",
  from: Date,
  to: Date,
): Promise<Map<string, number>> {
  const rows =
    column === "createdAt"
      ? await prisma.$queryRaw<DayRow[]>`
          SELECT date_trunc('day', "createdAt" AT TIME ZONE ${TIMEZONE}) AS day, count(*) AS count
          FROM "Subscriber"
          WHERE "botId" = ${botId} AND "createdAt" >= ${from} AND "createdAt" <= ${to}
          GROUP BY 1`
      : await prisma.$queryRaw<DayRow[]>`
          SELECT date_trunc('day', "unsubscribedAt" AT TIME ZONE ${TIMEZONE}) AS day, count(*) AS count
          FROM "Subscriber"
          WHERE "botId" = ${botId} AND "unsubscribedAt" >= ${from} AND "unsubscribedAt" <= ${to}
          GROUP BY 1`;

  return new Map(rows.map((row) => [dayKey(row.day), Number(row.count)]));
}

export async function getBotAnalytics(from: Date, to: Date): Promise<BotAnalytics[]> {
  const bots = await prisma.bot.findMany({ orderBy: { createdAt: "asc" } });
  const days = eachDay(from, to);

  return Promise.all(
    bots.map(async (bot) => {
      const [joinedByDay, leftByDay, active, beforeJoined, beforeLeft] = await Promise.all([
        countByDay(bot.id, "createdAt", from, to),
        countByDay(bot.id, "unsubscribedAt", from, to),
        prisma.subscriber.count({ where: { botId: bot.id, status: "ACTIVE" } }),
        prisma.subscriber.count({ where: { botId: bot.id, createdAt: { lt: from } } }),
        prisma.subscriber.count({ where: { botId: bot.id, unsubscribedAt: { lt: from } } }),
      ]);

      // Стартовая точка линии — те, кто был активен до начала периода.
      let running = beforeJoined - beforeLeft;
      const series: DayPoint[] = days.map((date) => {
        const joined = joinedByDay.get(date) ?? 0;
        const left = leftByDay.get(date) ?? 0;
        running += joined - left;
        return { date, joined, left, total: running };
      });

      return {
        botId: bot.id,
        title: bot.title,
        platform: bot.platform,
        active,
        joined: series.reduce((sum, point) => sum + point.joined, 0),
        left: series.reduce((sum, point) => sum + point.left, 0),
        series,
      };
    }),
  );
}

/** Разбор параметров периода: пресет на N дней или произвольные даты. */
export function parsePeriod(params: { from?: string; to?: string; days?: string }): {
  from: Date;
  to: Date;
  days: number;
  preset: boolean;
} {
  const to = params.to ? new Date(`${params.to}T23:59:59.999Z`) : new Date();
  let from: Date;
  let preset = true;

  if (params.from) {
    from = new Date(`${params.from}T00:00:00.000Z`);
    preset = false;
  } else {
    const days = Number(params.days) || 30;
    from = new Date(to);
    from.setUTCDate(from.getUTCDate() - (days - 1));
    from.setUTCHours(0, 0, 0, 0);
  }

  if (Number.isNaN(from.getTime())) from = new Date(Date.now() - 29 * 86400000);
  if (Number.isNaN(to.getTime())) return parsePeriod({});

  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  return { from, to, days, preset };
}
