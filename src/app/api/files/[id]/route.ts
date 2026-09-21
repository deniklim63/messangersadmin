import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Вложения переписки: только для вошедших в админку. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthenticated())) {
    return new NextResponse("Нужна авторизация", { status: 401 });
  }

  const { id } = await context.params;
  const file = await prisma.mediaFile.findUnique({ where: { id } });
  if (!file) return new NextResponse("Файл не найден", { status: 404 });

  const download = new URL(request.url).searchParams.has("download");
  const inline = !download && /^(image|video|audio)\//.test(file.mime);
  const filename = encodeURIComponent(file.filename);

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "content-type": file.mime,
      "content-length": String(file.size),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,
      "cache-control": "private, max-age=3600",
    },
  });
}
