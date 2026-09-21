import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { importRows } from "@/lib/import";

const schema = z.object({
  botId: z.string().min(1),
  rows: z
    .array(
      z.object({
        externalId: z.string(),
        name: z.string().nullish(),
        phone: z.string().nullish(),
        email: z.string().nullish(),
        city: z.string().nullish(),
        subscribedAt: z.string().nullish(),
      }),
    )
    .max(1000),
});

/** Приём одной пачки строк из файла — браузер шлёт их по очереди с прогрессом. */
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }

  const bot = await prisma.bot.findUnique({ where: { id: parsed.data.botId } });
  if (!bot) return NextResponse.json({ error: "Бот не найден" }, { status: 404 });

  return NextResponse.json(await importRows(bot.id, parsed.data.rows));
}
