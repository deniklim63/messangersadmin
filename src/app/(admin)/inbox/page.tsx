import { Inbox } from "@/components/inbox";
import { getChat, getConversations, getInboxFacets, markRead } from "@/lib/inbox";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const [conversations, facets] = await Promise.all([getConversations(), getInboxFacets()]);
  const first = conversations[0]?.subscriberId;
  const chat = first ? await getChat(first) : null;
  if (first) await markRead(first);

  return <Inbox initialConversations={conversations} initialChat={chat} initialFacets={facets} />;
}
