import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Переход по кнопке-ссылке: считаем нажатие и отправляем на настоящий адрес. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ buttonId: string; subscriberId: string }> },
) {
  const { buttonId, subscriberId } = await context.params;
  const button = await prisma.scenarioButton.findUnique({
    where: { id: buttonId },
    select: { url: true, blockId: true },
  });
  if (!button?.url) return new NextResponse("Ссылка не найдена", { status: 404 });

  await prisma.scenarioEvent
    .create({ data: { blockId: button.blockId, buttonId, subscriberId, kind: "click" } })
    .catch(() => null);

  return NextResponse.redirect(button.url, { status: 302 });
}
