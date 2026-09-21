import { NextResponse } from "next/server";
import { collectTelegramAttachments } from "@/lib/attachments";
import { prisma } from "@/lib/db";
import { answerCallbackQuery } from "@/lib/platforms";
import { handleIncomingMessage } from "@/lib/survey";

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramCallback = {
  id: string;
  data?: string;
  from?: TelegramUser;
  message?: { chat?: { id: number } };
};

type TelegramUpdate = {
  callback_query?: TelegramCallback;
  message?: {
    message_id?: number;
    from?: TelegramUser;
    chat?: { id: number };
    text?: string;
    caption?: string;
    contact?: { phone_number?: string };
    photo?: { file_id: string; file_size?: number }[];
    video?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
    document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
    voice?: { file_id: string; mime_type?: string; file_size?: number };
    audio?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number; title?: string };
    video_note?: { file_id: string; file_size?: number };
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
    if (update.callback_query) {
      // Нажали кнопку под сообщением: в data лежит id кнопки сценария.
      const callback = update.callback_query;
      const chatId = callback.message?.chat?.id ?? callback.from?.id;
      if (bot.token) await answerCallbackQuery(bot.token, callback.id);

      const button = callback.data
        ? await prisma.scenarioButton.findUnique({ where: { id: callback.data } })
        : null;

      if (chatId) {
        await handleIncomingMessage({
          bot,
          externalId: String(chatId),
          // Подменяем текстом кнопки — дальше работает обычная логика переходов.
          text: button?.label ?? callback.data ?? "",
          username: callback.from?.username ?? null,
          firstName: callback.from?.first_name ?? null,
          lastName: callback.from?.last_name ?? null,
        });
      }
    } else if (update.my_chat_member?.chat?.id) {
      const status = update.my_chat_member.new_chat_member?.status;
      const externalId = String(update.my_chat_member.chat.id);
      const blocked = status === "kicked" || status === "left";
      await prisma.subscriber.updateMany({
        where: { botId: bot.id, externalId },
        data: {
          status: blocked ? "BLOCKED" : "ACTIVE",
          unsubscribedAt: blocked ? new Date() : null,
          lastSeenAt: new Date(),
        },
      });
    } else if (update.message?.chat?.id) {
      // Фото, файлы, видео и голосовые скачиваем к себе, чтобы их было видно в переписке.
      const attachments = bot.token
        ? await collectTelegramAttachments(bot.token, update.message)
        : [];

      await handleIncomingMessage({
        bot,
        externalId: String(update.message.chat.id),
        text: update.message.text ?? update.message.caption ?? "",
        attachments,
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
