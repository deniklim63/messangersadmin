import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestContact } from "@/lib/contacts";
import { prisma } from "@/lib/db";

const schema = z.object({
  externalId: z.string().min(1),
  name: z.string().optional().nullable(),
  username: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
});

/**
 * Приём данных из внешнего бота или формы:
 * POST /api/ingest, заголовок Authorization: Bearer <ingestToken бота>.
 */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Нужен Bearer-токен" }, { status: 401 });

  const bot = await prisma.bot.findUnique({ where: { ingestToken: token } });
  if (!bot) return NextResponse.json({ error: "Неизвестный токен" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { contact, subscriber } = await ingestContact({ botId: bot.id, ...parsed.data });

  await prisma.webhookEvent.create({
    data: { botId: bot.id, source: "ingest", payload: parsed.data as object },
  });

  return NextResponse.json({
    ok: true,
    contactId: contact.id,
    subscriberId: subscriber.id,
  });
}
