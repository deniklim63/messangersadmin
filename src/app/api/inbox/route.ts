import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getConversations } from "@/lib/inbox";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }
  return NextResponse.json({ conversations: await getConversations() });
}
