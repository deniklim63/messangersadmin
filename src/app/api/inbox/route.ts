import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getConversations, getInboxFacets } from "@/lib/inbox";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const [conversations, facets] = await Promise.all([
    getConversations({
      botId: params.get("bot") || null,
      onlyOperator: params.get("operator") === "1",
      onlyUnread: params.get("unread") === "1",
      query: params.get("q") || null,
    }),
    getInboxFacets(),
  ]);
  return NextResponse.json({ conversations, facets });
}
