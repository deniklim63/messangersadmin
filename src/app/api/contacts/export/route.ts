import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { buildWhere, multiBotContactIds, parseFilters } from "@/lib/contact-filters";
import { prisma } from "@/lib/db";

function csvCell(value: string | null | undefined): string {
  const text = value ?? "";
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filters = parseFilters(Object.fromEntries(url.searchParams.entries()));
  const where = buildWhere(filters);
  if (filters.multi === "1") {
    const ids = await multiBotContactIds(prisma);
    Object.assign(where, { AND: [...((where.AND as object[]) ?? []), { id: { in: ids } }] });
  }

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { city: true, subscribers: { include: { bot: true } } },
  });

  const header = ["Имя", "Телефон", "E-mail", "Город", "Боты", "Добавлен"];
  const rows = contacts.map((contact) =>
    [
      csvCell(contact.name),
      csvCell(contact.phone),
      csvCell(contact.email),
      csvCell(contact.city?.name),
      csvCell(contact.subscribers.map((sub) => sub.bot.title).join(", ")),
      contact.createdAt.toISOString().slice(0, 10),
    ].join(";"),
  );

  // BOM — чтобы Excel открыл кириллицу без «кракозябр».
  const csv = "﻿" + [header.join(";"), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="contacts-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
