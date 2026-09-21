import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getChat, markRead } from "@/lib/inbox";

/** Переписка одного диалога. Открыли — значит прочитали. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ subscriberId: string }> },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const { subscriberId } = await context.params;
  const chat = await getChat(subscriberId);
  if (!chat) return NextResponse.json({ error: "Диалог не найден" }, { status: 404 });

  await markRead(subscriberId);
  return NextResponse.json(chat);
}
