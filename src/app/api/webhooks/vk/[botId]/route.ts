import { NextResponse } from "next/server";
import { collectVkAttachments } from "@/lib/attachments";
import { prisma } from "@/lib/db";
import { getVkUserInfo } from "@/lib/platforms";
import { handleIncomingMessage } from "@/lib/survey";

type VkEvent = {
  type?: string;
  secret?: string;
  group_id?: number;
  object?: {
    message?: {
      from_id?: number;
      text?: string;
      id?: number;
      conversation_message_id?: number;
      attachments?: { type: string; [key: string]: unknown }[];
    };
    // Старый формат message_new — поля лежат прямо в object.
    from_id?: number;
    text?: string;
    id?: number;
    user_id?: number;
  };
};

export async function POST(
  request: Request,
  context: { params: Promise<{ botId: string }> },
) {
  const { botId } = await context.params;
  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || bot.platform !== "VK") {
    return new NextResponse("Бот не найден", { status: 404 });
  }

  const event = (await request.json().catch(() => null)) as VkEvent | null;
  if (!event) return new NextResponse("Некорректный JSON", { status: 400 });

  // ВК сначала дёргает адрес и ждёт строку подтверждения — без неё Callback API не включится.
  if (event.type === "confirmation") {
    return new NextResponse(bot.vkConfirmation ?? "", {
      headers: { "content-type": "text/plain" },
    });
  }

  if (bot.vkSecret && event.secret !== bot.vkSecret) {
    return new NextResponse("Неверный секрет", { status: 401 });
  }
  if (!bot.isActive) return new NextResponse("ok");

  let error: string | null = null;
  try {
    if (event.type === "message_new") {
      const message = event.object?.message ?? event.object;
      const fromId = message?.from_id ?? event.object?.user_id;
      if (fromId) {
        const externalId = String(fromId);
        const profile = bot.token ? await getVkUserInfo(bot.token, externalId) : {};
        const attachments = await collectVkAttachments(
          (message as { attachments?: Parameters<typeof collectVkAttachments>[0] } | undefined)
            ?.attachments,
        );
        await handleIncomingMessage({
          bot,
          externalId,
          text: message?.text ?? "",
          attachments,
          firstName: profile.firstName ?? null,
          lastName: profile.lastName ?? null,
          profileCity: profile.city ?? null,
          messageExternalId: message?.id ? String(message.id) : null,
        });
      }
    } else if (event.type === "message_deny" && event.object?.user_id) {
      await prisma.subscriber.updateMany({
        where: { botId: bot.id, externalId: String(event.object.user_id) },
        data: { status: "BLOCKED", unsubscribedAt: new Date() },
      });
    } else if (event.type === "message_allow" && event.object?.user_id) {
      await prisma.subscriber.updateMany({
        where: { botId: bot.id, externalId: String(event.object.user_id) },
        data: { status: "ACTIVE", unsubscribedAt: null },
      });
    }
  } catch (caught) {
    error = (caught as Error).message;
  }

  await prisma.webhookEvent.create({
    data: { botId: bot.id, source: "vk", payload: event as object, error },
  });

  // ВК ждёт ровно «ok», иначе будет считать сервер недоступным и повторять событие.
  return new NextResponse("ok", { headers: { "content-type": "text/plain" } });
}
