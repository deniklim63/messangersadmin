import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toTelegramHtml } from "@/lib/message-format";

export const dynamic = "force-dynamic";

type Failure = { name: string; reason: string };

export default async function BroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const broadcast = await prisma.broadcast.findUnique({
    where: { id },
    include: { bot: true },
  });
  if (!broadcast) notFound();

  const cities = broadcast.cities.length
    ? await prisma.city.findMany({ where: { slug: { in: broadcast.cities } } })
    : [];
  const cityNames = broadcast.cities.map(
    (slug) => cities.find((city) => city.slug === slug)?.name ?? "Город не указан",
  );

  const failures = (broadcast.failures as Failure[] | null) ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link href="/broadcasts" className="text-sm text-[var(--muted)] hover:underline">
          ← Ко всем рассылкам
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Рассылка</h1>
        <p className="text-sm text-[var(--muted)]">
          {broadcast.bot.title} · {broadcast.createdAt.toLocaleString("ru-RU")}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Получателей", value: broadcast.recipients },
          { label: "Доставлено", value: broadcast.sent },
          { label: "Не дошло", value: broadcast.failed },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-[var(--line)] bg-white p-5">
            <div className="text-sm text-[var(--muted)]">{stat.label}</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">{stat.value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-sm font-semibold">Что отправляли</h2>

        <div className="mt-3 text-sm text-[var(--muted)]">
          Сегмент: {cityNames.length ? cityNames.join(", ") : "все города"}
          {broadcast.mediaKind
            ? ` · ${broadcast.mediaKind === "photo" ? "картинка" : "видео"}: ${broadcast.mediaName ?? "файл"}`
            : ""}
        </div>

        <div
          className="mt-3 whitespace-pre-wrap rounded-lg bg-[var(--bg)] p-4 text-sm [&_a]:text-[var(--accent)] [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: toTelegramHtml(broadcast.text) }}
        />

        <details className="mt-3 text-xs text-[var(--muted)]">
          <summary className="cursor-pointer">Исходный текст с разметкой</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-[var(--bg)] p-3 font-mono">
            {broadcast.text}
          </pre>
        </details>
      </section>

      {failures.length ? (
        <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
          <h2 className="text-sm font-semibold">Не доставлено</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {failures.map((failure) => (
              <li key={`${failure.name}-${failure.reason}`} className="text-red-700">
                {failure.name} — {failure.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
