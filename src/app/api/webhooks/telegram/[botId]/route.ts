import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleIncomingMessage } from "@/lib/survey";

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramUpdate = {
  message?: {
    message_id?: number;
    from?: TelegramUser;
    chat?: { id: number };
    text?: string;
    contact?: { phone_number?: string };
  };
  my_chat_member?: {
    chat?: { id: number };
    new_chat_member?: { status?: string };
  };
};

export async function POST(
  request: Request,
  context: { params: Promise<{ botId: string }> },
) {
  const { botId } = await context.params;
  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || bot.platform !== "TELEGRAM") {
    return NextResponse.json({ error: "Бот не найден" }, { status: 404 });
  }

  // Telegram присылает секрет заголовком — так посторонний не сможет слать апдейты.
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (bot.webhookSecret && secret !== bot.webhookSecret) {
    return NextResponse.json({ error: "Неверный секрет" }, { status: 401 });
  }
  if (!bot.isActive) return NextResponse.json({ ok: true, skipped: "бот выключен" });

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });

  let error: string | null = null;
  try {
    if (update.my_chat_member?.chat?.id) {
      const status = update.my_chat_member.new_chat_member?.status;
      const externalId = String(update.my_chat_member.chat.id);
      const blocked = status === "kicked" || status === "left";
      await prisma.subscriber.updateMany({
        where: { botId: bot.id, externalId },
        data: { status: blocked ? "BLOCKED" : "ACTIVE", lastSeenAt: new Date() },
      });
    } else if (update.message?.chat?.id) {
      await handleIncomingMessage({
        bot,
        externalId: String(update.message.chat.id),
        text: update.message.text ?? "",
        username: update.message.from?.username ?? null,
        firstName: update.message.from?.first_name ?? null,
        lastName: update.message.from?.last_name ?? null,
        sharedPhone: update.message.contact?.phone_number ?? null,
        messageExternalId: update.message.message_id
          ? String(update.message.message_id)
          : null,
      });
    }
  } catch (caught) {
    error = (caught as Error).message;
  }

  await prisma.webhookEvent.create({
    data: { botId: bot.id, source: "telegram", payload: update as object, error },
  });

  // Telegram повторяет запрос при не-200, поэтому ошибку отдаём в лог, а не в статус.
  return NextResponse.json({ ok: !error });
}
