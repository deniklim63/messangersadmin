import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { countUnread } from "@/lib/inbox";

/** Лёгкий счётчик для бейджа в меню. */
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }
  return NextResponse.json({ unread: await countUnread() });
}
