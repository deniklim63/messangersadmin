import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Переписка одного человека — этот адрес опрашивает открытая карточка. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const { id } = await context.params;
  const messages = await prisma.message.findMany({
    where: { contactId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { bot: { select: { title: true } } },
  });

  return NextResponse.json({
    messages: messages.map((message) => ({
      id: message.id,
      direction: message.direction,
      text: message.text,
      botTitle: message.bot.title,
      createdAt: message.createdAt.toISOString(),
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
    })),
  });
}
