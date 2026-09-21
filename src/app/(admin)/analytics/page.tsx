import Link from "next/link";
import { ChartLegend, JoinLeaveChart, TotalLineChart } from "@/components/charts";
import { getBotAnalytics, parsePeriod } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const PRESETS = [
  { days: 7, label: "7 дней" },
  { days: 30, label: "30 дней" },
  { days: 90, label: "90 дней" },
];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
      <div className="text-sm text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div> : null}
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    const raw = Array.isArray(value) ? value[0] : value;
    return raw?.trim() || undefined;
  };

  const period = parsePeriod({ from: pick("from"), to: pick("to"), days: pick("days") });
  const stats = await getBotAnalytics(period.from, period.to);

  const totals = stats.reduce(
    (sum, bot) => ({
      active: sum.active + bot.active,
      joined: sum.joined + bot.joined,
      left: sum.left + bot.left,
    }),
    { active: 0, joined: 0, left: 0 },
  );

  const inputClass =
    "rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Аналитика</h1>
        <p className="text-sm text-[var(--muted)]">
          {period.from.toLocaleDateString("ru-RU")} — {period.to.toLocaleDateString("ru-RU")},{" "}
          {period.days} дн. Дни считаются по московскому времени.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--line)] bg-white p-4">
        <div className="flex gap-2">
          {PRESETS.map((preset) => {
            const active = period.preset && period.days === preset.days;
            return (
              <Link
                key={preset.days}
                href={`/analytics?days=${preset.days}`}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  active
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-[var(--line)] hover:border-[var(--accent)]"
                }`}
              >
                {preset.label}
              </Link>
            );
          })}
        </div>

        <form className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-[var(--muted)]">
            С
            <input
              type="date"
              name="from"
              defaultValue={isoDate(period.from)}
              className={`mt-1 block ${inputClass}`}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            По
            <input
              type="date"
              name="to"
              defaultValue={isoDate(period.to)}
              className={`mt-1 block ${inputClass}`}
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Показать
          </button>
        </form>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Активных пользователей" value={totals.active} hint="сейчас, по всем ботам" />
        <Stat label="Подписались" value={totals.joined} hint="за выбранный период" />
        <Stat label="Отписались" value={totals.left} hint="за выбранный период" />
      </section>

      {stats.length === 0 ? (
        <section className="rounded-2xl border border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">
          Сначала{" "}
          <Link href="/bots" className="text-[var(--accent)]">
            подключите бота
          </Link>
          .
        </section>
      ) : null}

      {stats.map((bot) => (
        <section key={bot.botId} className="rounded-2xl border border-[var(--line)] bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">
              <Link href={`/bots/${bot.botId}`} className="hover:text-[var(--accent)]">
                {bot.title}
              </Link>
              <span className="ml-2 text-sm font-normal text-[var(--muted)]">
                {bot.platform === "TELEGRAM" ? "Telegram" : "ВКонтакте"}
              </span>
            </h2>
            <div className="flex gap-5 text-sm">
              <span>
                Активных: <b className="tabular-nums">{bot.active}</b>
              </span>
              <span>
                Подписались: <b className="tabular-nums">{bot.joined}</b>
              </span>
              <span>
                Отписались: <b className="tabular-nums">{bot.left}</b>
              </span>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-medium">Всего пользователей</h3>
            <TotalLineChart points={bot.series} />
          </div>

          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Подписки и отписки по дням</h3>
              <ChartLegend />
            </div>
            <JoinLeaveChart points={bot.series} />
          </div>

          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-[var(--muted)]">Показать таблицей</summary>
            <div className="mt-2 max-h-64 overflow-y-auto">
              <table className="w-full text-left">
                <thead className="text-[var(--muted)]">
                  <tr>
                    <th className="py-1 font-medium">Дата</th>
                    <th className="py-1 font-medium">Подписались</th>
                    <th className="py-1 font-medium">Отписались</th>
                    <th className="py-1 font-medium">Всего</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {[...bot.series].reverse().map((point) => (
                    <tr key={point.date} className="border-t border-[var(--line)]">
                      <td className="py-1">
                        {new Date(point.date).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="py-1">{point.joined}</td>
                      <td className="py-1">{point.left}</td>
                      <td className="py-1">{point.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      ))}
    </div>
  );
}
