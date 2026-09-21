import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Отдаёт картинку блока. Адрес публичный намеренно: по нему файл забирает
 * Telegram, когда мы отправляем картинку ссылкой.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const file = await prisma.mediaFile.findUnique({ where: { id } });
  // Публично отдаём только картинки сценариев; вложения переписки — через /api/files.
  if (!file || file.scope !== "scenario") return new NextResponse("Файл не найден", { status: 404 });

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "content-type": file.mime,
      "content-length": String(file.size),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
