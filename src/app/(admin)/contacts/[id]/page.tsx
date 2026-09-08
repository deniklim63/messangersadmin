import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactForm } from "@/components/contact-form";
import { deleteContact } from "@/lib/actions-contacts";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "активен",
  BLOCKED: "заблокировал бота",
  LEFT: "отписался",
};

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      city: true,
      subscribers: { include: { bot: true }, orderBy: { createdAt: "asc" } },
      messages: { orderBy: { createdAt: "desc" }, take: 30, include: { bot: true } },
    },
  });
  if (!contact) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/contacts" className="text-sm text-[var(--muted)] hover:underline">
            ← Ко всем пользователям
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">
            {contact.name ?? contact.phone ?? "Без имени"}
          </h1>
        </div>
        <form action={deleteContact}>
          <input type="hidden" name="id" value={contact.id} />
          <button
            type="submit"
            className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-red-600 hover:border-red-300"
          >
            Удалить
          </button>
        </form>
      </header>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <ContactForm contact={contact} />
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-sm font-semibold">В каких ботах</h2>
        <ul className="mt-3 divide-y divide-[var(--line)]">
          {contact.subscribers.map((sub) => (
            <li key={sub.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {sub.bot.platform === "TELEGRAM" ? "Telegram" : "ВКонтакте"} · {sub.bot.title}
                {sub.username ? (
                  <span className="text-[var(--muted)]"> · @{sub.username}</span>
                ) : null}
              </span>
              <span className="text-[var(--muted)]">
                id {sub.externalId} · {STATUS_LABEL[sub.status] ?? sub.status}
              </span>
            </li>
          ))}
          {contact.subscribers.length === 0 ? (
            <li className="py-2 text-sm text-[var(--muted)]">Ни в одном боте</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-sm font-semibold">Переписка</h2>
        {contact.messages.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">Сообщений пока нет.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {contact.messages.map((message) => (
              <li
                key={message.id}
                className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  message.direction === "IN"
                    ? "bg-[var(--bg)]"
                    : "ml-auto bg-blue-50 text-blue-900"
                }`}
              >
                <div className="whitespace-pre-wrap">{message.text}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {message.bot.title} · {message.createdAt.toLocaleString("ru-RU")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
